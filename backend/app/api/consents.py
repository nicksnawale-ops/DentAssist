"""Consent form templates, preparing consents, and signing (in clinic, by link, or in the portal)."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from pydantic import Field
from sqlalchemy import select

from app.api.patients import get_patient_for
from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, StaffUser, ensure_clinic_access, require_roles
from app.core.errors import AppError, bad_request, not_found
from app.models import Clinic, ConsentForm, ConsentTemplate, Patient, TreatmentPlan, User
from app.schemas import CamelModel
from app.services import audit, ratelimit
from app.services import consents as svc
from app.services import messaging as msg
from app.services.scheduling import as_utc

router = APIRouter(tags=["consents"])
Admins = Depends(require_roles("super_admin", "admin"))
RELATIONSHIPS = "^(Self|Parent|Guardian|Spouse|Child|Other)$"


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class TemplateIn(CamelModel):
    name: str = Field(min_length=2, max_length=150)
    body: str = Field(min_length=20, max_length=8000)
    risks: list[str] = Field(default_factory=list, max_length=30)
    is_active: bool = True


class TemplateOut(TemplateIn):
    id: str
    version: int
    updated_at: datetime


class ConsentCreate(CamelModel):
    template_id: str
    procedure: str = Field(default="", max_length=200)
    teeth: list[str] = Field(default_factory=list, max_length=32)
    dentist_id: str | None = None
    treatment_plan_id: str | None = None
    clinic_id: str | None = None


class SignIn(CamelModel):
    signature: str = Field(min_length=50, max_length=500_000)  # PNG data URL
    signed_by_name: str = Field(min_length=2, max_length=150)
    relationship: str = Field(default="Self", pattern=RELATIONSHIPS)
    agree: bool


class RevokeIn(CamelModel):
    reason: str = Field(min_length=3, max_length=300)


class ConsentOut(CamelModel):
    id: str
    patient_id: str
    patient_name: str
    clinic_id: str
    clinic_name: str
    template_id: str | None
    template_version: int
    title: str
    body: str
    risks: list[str]
    procedure: str
    teeth: list[str]
    dentist_name: str | None
    treatment_plan_id: str | None
    status: str
    signature: str | None = None
    signed_by_name: str | None
    signer_relationship: str | None
    signed_at: datetime | None
    signed_via: str | None
    witness_name: str | None
    content_hash: str | None
    verified: bool
    link_expires_at: datetime | None
    revoked_at: datetime | None
    revoke_reason: str | None
    created_at: datetime


class LinkOut(CamelModel):
    url: str
    expires_at: datetime
    whatsapp_status: str
    detail: str


class PublicConsentOut(CamelModel):
    title: str
    body: str
    risks: list[str]
    clinic_name: str
    patient_first_name: str
    patient_full_name: str
    status: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _name(u: User | None) -> str | None:
    return f"{u.first_name} {u.last_name}".strip() if u else None


def _out(db, f: ConsentForm, with_signature: bool = True) -> ConsentOut:
    patient = db.get(Patient, f.patient_id)
    clinic = db.get(Clinic, f.clinic_id)
    dentist = db.get(User, f.dentist_id) if f.dentist_id else None
    witness = db.get(User, f.witness_id) if f.witness_id else None
    return ConsentOut(
        id=f.id, patient_id=f.patient_id, patient_name=f"{patient.first_name} {patient.last_name}".strip() if patient else "",
        clinic_id=f.clinic_id, clinic_name=clinic.name if clinic else "", template_id=f.template_id,
        template_version=f.template_version, title=f.title, body=f.body, risks=f.risks or [], procedure=f.procedure,
        teeth=f.teeth or [], dentist_name=f"Dr. {_name(dentist)}" if dentist else None, treatment_plan_id=f.treatment_plan_id,
        status=f.status, signature=f.signature if with_signature else None, signed_by_name=f.signed_by_name,
        signer_relationship=f.signer_relationship, signed_at=f.signed_at, signed_via=f.signed_via,
        witness_name=_name(witness), content_hash=f.content_hash, verified=svc.verify(f),
        link_expires_at=f.sign_token_expires_at if f.status == "pending" else None,
        revoked_at=f.revoked_at, revoke_reason=f.revoke_reason, created_at=f.created_at,
    )


def _get(db, user: User, consent_id: str) -> ConsentForm:
    f = db.get(ConsentForm, consent_id)
    if not f:
        raise not_found("Consent form")
    get_patient_for(db, user, f.patient_id)
    return f


def _sign(db, f: ConsentForm, body: SignIn, request: Request, via: str, witness: User | None) -> None:
    if f.status != "pending":
        raise bad_request("This form has already been signed" if f.status == "signed" else "This form was withdrawn",
                          "CONSENT_NOT_PENDING")
    if not body.agree:
        raise AppError(400, "Tick the box to confirm you agree", "CONSENT_NOT_AGREED", {"agree": "Required"})
    try:
        svc.sign(f, signature=body.signature, signed_by_name=body.signed_by_name, relationship=body.relationship,
                 via=via, witness=witness, ip=ratelimit.client_ip(request), user_agent=request.headers.get("user-agent"))
    except ValueError as exc:
        raise AppError(400, str(exc), "INVALID_SIGNATURE", {"signature": str(exc)})


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

@router.get("/consent-templates", response_model=list[TemplateOut])
def list_templates(db: DbSession, user: StaffUser, include_inactive: bool = False):
    query = select(ConsentTemplate).order_by(ConsentTemplate.name)
    if not include_inactive:
        query = query.where(ConsentTemplate.is_active.is_(True))
    return db.scalars(query).all()


@router.post("/consent-templates", response_model=TemplateOut, status_code=201)
def create_template(body: TemplateIn, db: DbSession, user: User = Admins):
    t = ConsentTemplate(**body.model_dump())
    db.add(t)
    db.flush()
    audit.record(db, user, "create", "consent_template", t.id, after=body.model_dump())
    db.commit()
    return t


@router.put("/consent-templates/{template_id}", response_model=TemplateOut)
def update_template(template_id: str, body: TemplateIn, db: DbSession, user: User = Admins):
    """Editing makes a new version; forms already prepared or signed keep the wording they had."""
    t = db.get(ConsentTemplate, template_id)
    if not t:
        raise not_found("Consent template")
    changed = (t.body, t.risks, t.name) != (body.body, body.risks, body.name)
    for k, v in body.model_dump().items():
        setattr(t, k, v)
    if changed:
        t.version += 1
    audit.record(db, user, "update", "consent_template", t.id, after={**body.model_dump(), "version": t.version})
    db.commit()
    return t


# ---------------------------------------------------------------------------
# Consent forms
# ---------------------------------------------------------------------------

@router.get("/patients/{patient_id}/consents", response_model=list[ConsentOut])
def list_for_patient(patient_id: str, db: DbSession, user: CurrentUser):
    get_patient_for(db, user, patient_id)
    query = select(ConsentForm).where(ConsentForm.patient_id == patient_id).order_by(ConsentForm.created_at.desc())
    return [_out(db, f, with_signature=False) for f in db.scalars(query)]


@router.post("/patients/{patient_id}/consents", response_model=ConsentOut, status_code=201)
def prepare(patient_id: str, body: ConsentCreate, db: DbSession, user: StaffUser):
    patient = get_patient_for(db, user, patient_id)
    clinic_id = body.clinic_id or patient.clinic_id or user.clinic_id
    ensure_clinic_access(user, clinic_id)
    clinic = db.get(Clinic, clinic_id) if clinic_id else None
    template = db.get(ConsentTemplate, body.template_id)
    if not clinic or not template or not template.is_active:
        raise bad_request("Choose a consent form", "TEMPLATE_REQUIRED")
    dentist_id = body.dentist_id or (user.id if user.role == "dentist" else None)
    dentist = db.get(User, dentist_id) if dentist_id else None
    if dentist and dentist.role != "dentist":
        raise bad_request("Choose a dentist", "INVALID_DENTIST")
    if body.treatment_plan_id:
        plan = db.get(TreatmentPlan, body.treatment_plan_id)
        if not plan or plan.patient_id != patient.id:
            raise not_found("Treatment plan")
    teeth = [t.strip() for t in body.teeth if t.strip()]
    now = datetime.now(timezone.utc)
    f = ConsentForm(
        patient_id=patient.id, clinic_id=clinic.id, template_id=template.id, template_version=template.version,
        title=template.name, body=svc.render(template.body, patient=patient, clinic=clinic, dentist=dentist,
                                             procedure=body.procedure.strip(), teeth=teeth, when=now),
        risks=list(template.risks or []), procedure=body.procedure.strip(), teeth=teeth,
        dentist_id=dentist.id if dentist else None, treatment_plan_id=body.treatment_plan_id, created_by_id=user.id,
    )
    db.add(f)
    db.flush()
    audit.record(db, user, "create", "consent_form", f.id, after={"title": f.title, "procedure": f.procedure})
    db.commit()
    return _out(db, f)


@router.get("/consents/{consent_id}", response_model=ConsentOut)
def get_one(consent_id: str, db: DbSession, user: CurrentUser):
    return _out(db, _get(db, user, consent_id))


@router.post("/consents/{consent_id}/sign", response_model=ConsentOut)
def sign_in_clinic(consent_id: str, body: SignIn, request: Request, db: DbSession, user: StaffUser):
    """Patient signs on a clinic tablet or phone; the logged-in staff member is recorded as witness."""
    f = _get(db, user, consent_id)
    _sign(db, f, body, request, "clinic_device", witness=user)
    audit.record(db, user, "sign", "consent_form", f.id, after={"via": "clinic_device", "hash": f.content_hash})
    db.commit()
    return _out(db, f)


@router.post("/consents/{consent_id}/send-link", response_model=LinkOut)
def send_link(consent_id: str, db: DbSession, user: StaffUser):
    """Create a 3-day signing link and send it to the patient on WhatsApp. A new link replaces the old one."""
    f = _get(db, user, consent_id)
    if f.status != "pending":
        raise bad_request("Only unsigned forms can be sent", "CONSENT_NOT_PENDING")
    token = svc.new_sign_token(f)
    url = f"{get_settings().public_app_url.rstrip('/')}/consent/{token}"
    patient = db.get(Patient, f.patient_id)
    clinic = db.get(Clinic, f.clinic_id)
    row = msg.send_template(db, patient, "consent_request",
                            [msg._first_name(patient), clinic.name, f.procedure or f.title.lower(), url],
                            actor=user, payload={"consentId": f.id})
    audit.record(db, user, "send_link", "consent_form", f.id, after={"whatsapp": row.status if row else None})
    db.commit()
    status = row.status if row else "skipped"
    return LinkOut(url=url, expires_at=f.sign_token_expires_at, whatsapp_status=status,
                   detail="Sent on WhatsApp" if status == "sent" else ((row.error if row else None) or "Not sent. Share the link yourself."))


@router.post("/consents/{consent_id}/revoke", response_model=ConsentOut)
def revoke(consent_id: str, body: RevokeIn, db: DbSession, user: User = Depends(require_roles("super_admin", "admin", "dentist", "receptionist"))):
    """Withdraw a form (the patient changed their mind, or it was prepared by mistake). The record is kept."""
    f = _get(db, user, consent_id)
    if f.status == "revoked":
        raise bad_request("Already withdrawn", "ALREADY_REVOKED")
    f.status, f.revoked_at, f.revoke_reason = "revoked", datetime.now(timezone.utc), body.reason.strip()
    f.sign_token_hash = f.sign_token_expires_at = None
    audit.record(db, user, "revoke", "consent_form", f.id, after={"reason": f.revoke_reason})
    db.commit()
    return _out(db, f)


# ---------------------------------------------------------------------------
# Patient portal and public signing link
# ---------------------------------------------------------------------------

@router.get("/patient-portal/consents", response_model=list[ConsentOut])
def my_consents(db: DbSession, user: User = Depends(require_roles("patient"))):
    if not user.patient_id:
        return []
    return list_for_patient(user.patient_id, db, user)


@router.post("/patient-portal/consents/{consent_id}/sign", response_model=ConsentOut)
def sign_in_portal(consent_id: str, body: SignIn, request: Request, db: DbSession,
                   user: User = Depends(require_roles("patient"))):
    f = _get(db, user, consent_id)
    _sign(db, f, body, request, "patient_portal", witness=None)
    audit.record(db, user, "sign", "consent_form", f.id, after={"via": "patient_portal", "hash": f.content_hash})
    db.commit()
    return _out(db, f)


def _by_token(db, token: str) -> ConsentForm:
    f = svc.find_by_token(db, token)
    if not f or not f.sign_token_expires_at or as_utc(f.sign_token_expires_at) < datetime.now(timezone.utc):
        raise AppError(404, "This link has expired or was already used. Ask the clinic for a new one.", "LINK_INVALID")
    return f


@router.get("/public/consents/{token}", response_model=PublicConsentOut)
def public_view(token: str, request: Request, db: DbSession):
    ratelimit.check(request, "consent-view", 30, 600)
    f = _by_token(db, token)
    patient = db.get(Patient, f.patient_id)
    clinic = db.get(Clinic, f.clinic_id)
    return PublicConsentOut(title=f.title, body=f.body, risks=f.risks or [], clinic_name=clinic.name if clinic else "",
                            patient_first_name=patient.first_name if patient else "",
                            patient_full_name=f"{patient.first_name} {patient.last_name}".strip() if patient else "",
                            status=f.status)


@router.post("/public/consents/{token}/sign")
def public_sign(token: str, body: SignIn, request: Request, db: DbSession):
    ratelimit.check(request, "consent-sign", 10, 600)
    f = _by_token(db, token)
    _sign(db, f, body, request, "remote_link", witness=None)
    audit.record(db, None, "sign", "consent_form", f.id, after={"via": "remote_link", "hash": f.content_hash})
    db.commit()
    return {"status": "signed", "signedAt": f.signed_at}
