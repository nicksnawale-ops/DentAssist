"""Leads and enquiries: the pipeline, follow-ups, conversion, the public enquiry form and lead-ad webhooks."""

import secrets
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import Field
from sqlalchemy import or_, select

from app.core.config import get_settings
from app.core.deps import DbSession, StaffUser, accessible_clinic_ids, ensure_clinic_access, require_roles
from app.core.errors import AppError, bad_request, not_found
from app.models import Clinic, Lead, LeadActivity, Patient, User
from app.schemas import CamelModel
from app.services import audit, ratelimit
from app.services import leads as svc
from app.services.scheduling import as_utc
from app.services.whatsapp import normalise_phone

router = APIRouter(tags=["leads"])
Admins = Depends(require_roles("super_admin", "admin"))
SOURCE_RE = "^(" + "|".join(svc.SOURCES) + ")$"
STATUS_RE = "^(" + "|".join(svc.STATUSES) + ")$"
LOST_RE = "^(" + "|".join(svc.LOST_REASONS) + ")$"


class LeadOut(CamelModel):
    id: str
    clinic_id: str
    name: str
    phone: str
    email: str | None
    source: str
    interest: str | None
    message: str | None
    status: str
    lost_reason: str | None
    estimated_value: Decimal | None
    assigned_to_id: str | None
    assigned_to_name: str | None = None
    next_follow_up_at: datetime | None
    is_overdue: bool = False
    first_contacted_at: datetime | None
    last_contacted_at: datetime | None
    contact_count: int
    language: str
    whatsapp_consent: bool
    patient_id: str | None
    patient_name: str | None = None
    appointment_id: str | None
    converted_at: datetime | None
    closed_at: datetime | None
    campaign: dict | None
    created_at: datetime
    updated_at: datetime


class ActivityOut(CamelModel):
    id: str
    kind: str
    body: str
    outcome: str | None
    data: dict | None
    created_by_name: str | None = None
    created_at: datetime


class LeadDetail(LeadOut):
    activities: list[ActivityOut] = []


class LeadCreate(CamelModel):
    clinic_id: str | None = None
    name: str = Field(min_length=1, max_length=150)
    phone: str = Field(min_length=8, max_length=20)
    email: str | None = Field(default=None, max_length=255)
    source: str = Field(default="phone", pattern=SOURCE_RE)
    interest: str | None = Field(default=None, max_length=100)
    message: str | None = Field(default=None, max_length=2000)
    estimated_value: Decimal | None = Field(default=None, ge=0, le=10_000_000)
    assigned_to_id: str | None = None
    language: str = Field(default="en", pattern="^(en|hi|mr)$")
    whatsapp_consent: bool = False
    referred_by_patient_id: str | None = None


class CreatedOut(CamelModel):
    lead: LeadOut
    merged: bool


class LeadUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    email: str | None = Field(default=None, max_length=255)
    interest: str | None = Field(default=None, max_length=100)
    estimated_value: Decimal | None = Field(default=None, ge=0, le=10_000_000)
    assigned_to_id: str | None = None
    next_follow_up_at: datetime | None = None
    status: str | None = Field(default=None, pattern=STATUS_RE)
    lost_reason: str | None = Field(default=None, pattern=LOST_RE)
    language: str | None = Field(default=None, pattern="^(en|hi|mr)$")
    whatsapp_consent: bool | None = None
    note: str | None = Field(default=None, max_length=1000)


class ActivityIn(CamelModel):
    kind: str = Field(pattern="^(note|call)$")
    body: str = Field(default="", max_length=4000)
    outcome: str | None = Field(default=None, pattern="^(answered|no_answer|busy|wrong_number|call_back)$")
    next_follow_up_at: datetime | None = None


class ConvertIn(CamelModel):
    patient_id: str | None = None


class LeadSettings(CamelModel):
    auto_acknowledge: bool | None = None
    first_response_minutes: int | None = Field(default=None, ge=1, le=1440)
    follow_up_days: int | None = Field(default=None, ge=1, le=60)
    whatsapp_clinic_id: str | None = None


class PublicEnquiryIn(CamelModel):
    name: str = Field(min_length=1, max_length=150)
    phone: str = Field(min_length=8, max_length=20)
    email: str | None = Field(default=None, max_length=255)
    interest: str | None = Field(default=None, max_length=100)
    message: str | None = Field(default=None, max_length=2000)
    whatsapp_consent: bool = False
    language: str = Field(default="en", pattern="^(en|hi|mr)$")
    source: str | None = Field(default=None, pattern=SOURCE_RE)
    utm: dict[str, str] | None = None
    website: str | None = Field(default=None, max_length=200)  # honeypot: real people leave it empty


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _names(db, ids: set[str]) -> dict[str, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {u.id: f"{u.first_name} {u.last_name}".strip() for u in db.scalars(select(User).where(User.id.in_(ids))).unique()}


def _patient_names(db, ids: set[str]) -> dict[str, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {p.id: f"{p.first_name} {p.last_name}".strip() for p in db.scalars(select(Patient).where(Patient.id.in_(ids)))}


def _out(lead: Lead, users: dict[str, str], patients: dict[str, str], now: datetime) -> LeadOut:
    out = LeadOut.model_validate(lead)
    out.assigned_to_name = users.get(lead.assigned_to_id or "")
    out.patient_name = patients.get(lead.patient_id or "")
    out.is_overdue = bool(lead.status in svc.OPEN and lead.next_follow_up_at and as_utc(lead.next_follow_up_at) <= now)
    return out


def _one(db, lead: Lead) -> LeadOut:
    return _out(lead, _names(db, {lead.assigned_to_id}), _patient_names(db, {lead.patient_id}), datetime.now(timezone.utc))


def _get(db, user: User, lead_id: str) -> Lead:
    lead = db.get(Lead, lead_id)
    if not lead:
        raise not_found("Enquiry")
    ensure_clinic_access(user, lead.clinic_id)
    return lead


def _check_assignee(db, user: User, assignee_id: str | None, clinic_id: str) -> None:
    if not assignee_id:
        return
    u = db.get(User, assignee_id)
    clinics = {u.clinic_id} | set((u.staff_profile.clinic_ids if u and u.staff_profile else None) or []) if u else set()
    if not u or u.role == "patient" or not u.is_active or (u.role != "super_admin" and clinic_id not in clinics):
        raise bad_request("Choose someone who works at this clinic", "INVALID_ASSIGNEE", {"assignedToId": "Not on this clinic's team"})


def _range(start: date | None, end: date | None) -> tuple[datetime, datetime]:
    end = end or date.today()
    start = start or end - timedelta(days=29)
    return (datetime.combine(start, time.min, tzinfo=timezone.utc),
            datetime.combine(end + timedelta(days=1), time.min, tzinfo=timezone.utc))


def _scope(user: User, clinic_id: str | None) -> set[str] | None:
    if clinic_id:
        ensure_clinic_access(user, clinic_id)
        return {clinic_id}
    return accessible_clinic_ids(user)


# ---------------------------------------------------------------------------
# Staff endpoints
# ---------------------------------------------------------------------------

@router.get("/leads/meta")
def meta(db: DbSession, user: StaffUser, clinic_id: str | None = Query(default=None, alias="clinicId")):
    scope = _scope(user, clinic_id)
    staff = []
    for u in db.scalars(select(User).where(User.role.in_(("admin", "receptionist", "dentist")), User.is_active.is_(True))).unique():
        clinics = {u.clinic_id} | set((u.staff_profile.clinic_ids if u.staff_profile else None) or [])
        if scope is None or clinics & scope:
            staff.append({"id": u.id, "name": f"{u.first_name} {u.last_name}".strip(), "role": u.role})
    return {"sources": list(svc.SOURCES), "statuses": list(svc.STATUSES), "lostReasons": list(svc.LOST_REASONS),
            "interests": list(svc.INTERESTS), "staff": sorted(staff, key=lambda s: s["name"])}


@router.get("/leads/summary")
def lead_summary(db: DbSession, user: StaffUser, clinic_id: str | None = Query(default=None, alias="clinicId"),
                 start: date | None = Query(default=None, alias="from"), end: date | None = Query(default=None, alias="to")):
    scope = _scope(user, clinic_id)
    a, b = _range(start, end)
    return svc.summary(db, scope, a, b)


@router.get("/leads/settings")
def get_settings_(db: DbSession, user: User = Admins):
    return svc.settings(db)


@router.put("/leads/settings")
def put_settings(body: LeadSettings, db: DbSession, user: User = Admins):
    changes = body.model_dump(by_alias=True, exclude_unset=True)
    if changes.get("whatsappClinicId"):
        ensure_clinic_access(user, changes["whatsappClinicId"])
        if not db.get(Clinic, changes["whatsappClinicId"]):
            raise not_found("Clinic")
    result = svc.save_settings(db, changes)
    audit.record(db, user, "update", "lead_settings", "lead_settings", after=result)
    db.commit()
    return result


@router.get("/leads", response_model=list[LeadOut])
def list_leads(
    db: DbSession, user: StaffUser,
    clinic_id: str | None = Query(default=None, alias="clinicId"),
    status: str | None = None,
    source: str | None = None,
    assigned_to: str | None = Query(default=None, alias="assignedTo"),
    view: str = Query(default="open", pattern="^(open|overdue|closed|all)$"),
    q: str | None = Query(default=None, max_length=100),
    start: date | None = Query(default=None, alias="from"),
    end: date | None = Query(default=None, alias="to"),
    limit: int = Query(default=300, ge=1, le=1000),
):
    scope = _scope(user, clinic_id)
    query = select(Lead)
    if scope is not None:
        query = query.where(Lead.clinic_id.in_(scope))
    if status:
        query = query.where(Lead.status == status)
    elif view in ("open", "overdue"):
        query = query.where(Lead.status.in_(svc.OPEN))
    elif view == "closed":
        query = query.where(Lead.status.in_(("won", "lost")))
    if source:
        query = query.where(Lead.source == source)
    if assigned_to == "me":
        query = query.where(Lead.assigned_to_id == user.id)
    elif assigned_to == "none":
        query = query.where(Lead.assigned_to_id.is_(None))
    elif assigned_to:
        query = query.where(Lead.assigned_to_id == assigned_to)
    if start or end:
        a, b = _range(start, end)
        query = query.where(Lead.created_at >= a, Lead.created_at < b)
    if q:
        like = f"%{q.strip()}%"
        digits = "".join(ch for ch in q if ch.isdigit())
        conds = [Lead.name.ilike(like), Lead.interest.ilike(like), Lead.email.ilike(like)]
        if len(digits) >= 4:
            conds.append(Lead.phone.like(f"%{digits}%"))
        query = query.where(or_(*conds))
    leads = list(db.scalars(query.order_by(Lead.created_at.desc()).limit(limit)))
    if svc.sync_progress(db, leads):
        db.commit()
    now = datetime.now(timezone.utc)
    users = _names(db, {x.assigned_to_id for x in leads})
    patients = _patient_names(db, {x.patient_id for x in leads})
    out = [_out(x, users, patients, now) for x in leads]
    if view == "overdue":
        out = [x for x in out if x.is_overdue]
    if view in ("open", "overdue"):
        # Most urgent first: overdue, then by follow-up time, then newest.
        far = datetime.max.replace(tzinfo=timezone.utc)
        out.sort(key=lambda x: (not x.is_overdue, as_utc(x.next_follow_up_at) if x.next_follow_up_at else far))
    return out


@router.post("/leads", response_model=CreatedOut, status_code=201)
def create_lead(body: LeadCreate, db: DbSession, user: StaffUser):
    clinic_id = body.clinic_id or user.clinic_id
    if not clinic_id:
        raise bad_request("Select the clinic", "CLINIC_REQUIRED")
    ensure_clinic_access(user, clinic_id)
    clinic = db.get(Clinic, clinic_id)
    if not clinic:
        raise not_found("Clinic")
    _check_assignee(db, user, body.assigned_to_id, clinic_id)
    if not normalise_phone(body.phone):
        raise bad_request("Enter a valid 10-digit mobile number", "INVALID_PHONE", {"phone": "Invalid number"})
    lead, merged = svc.capture(
        db, clinic, name=body.name, phone=body.phone, source=body.source, email=body.email, interest=body.interest,
        message=body.message, language=body.language, whatsapp_consent=body.whatsapp_consent,
        estimated_value=body.estimated_value, assigned_to_id=body.assigned_to_id or (user.id if body.source == "walk_in" else None),
        referred_by_patient_id=body.referred_by_patient_id, actor=user)
    audit.record(db, user, "update" if merged else "create", "lead", lead.id, after=body)
    db.commit()
    return CreatedOut(lead=_one(db, lead), merged=merged)


@router.get("/leads/{lead_id}", response_model=LeadDetail)
def get_lead(lead_id: str, db: DbSession, user: StaffUser):
    lead = _get(db, user, lead_id)
    if svc.sync_progress(db, [lead]):
        db.commit()
    acts = list(db.scalars(select(LeadActivity).where(LeadActivity.lead_id == lead.id).order_by(LeadActivity.created_at.desc())))
    names = _names(db, {a.created_by_id for a in acts})
    detail = LeadDetail(**_one(db, lead).model_dump())
    detail.activities = [_activity(a, names) for a in acts]
    return detail


def _activity(a: LeadActivity, names: dict[str, str]) -> ActivityOut:
    out = ActivityOut.model_validate(a)
    out.created_by_name = names.get(a.created_by_id or "")
    return out


@router.patch("/leads/{lead_id}", response_model=LeadOut)
def update_lead(lead_id: str, body: LeadUpdate, db: DbSession, user: StaffUser):
    lead = _get(db, user, lead_id)
    data = body.model_dump(exclude_unset=True)
    before = audit.snapshot(_one(db, lead))
    if "assigned_to_id" in data and data["assigned_to_id"] != lead.assigned_to_id:
        _check_assignee(db, user, data["assigned_to_id"], lead.clinic_id)
        lead.assigned_to_id = data["assigned_to_id"]
        name = _names(db, {lead.assigned_to_id}).get(lead.assigned_to_id or "", "nobody")
        svc.add_activity(db, lead, "assigned", f"Assigned to {name}", user)
        if lead.assigned_to_id and lead.assigned_to_id != user.id:
            from app.models import Notification

            db.add(Notification(user_id=lead.assigned_to_id, title="Enquiry assigned to you",
                                message=f"{lead.name} (+{lead.phone})" + (f", {lead.interest}" if lead.interest else "")))
    for field in ("name", "email", "interest", "estimated_value", "language", "whatsapp_consent"):
        if field in data and data[field] is not None:
            setattr(lead, field, data[field].strip() if isinstance(data[field], str) else data[field])
    if "next_follow_up_at" in data:
        lead.next_follow_up_at = data["next_follow_up_at"]
        lead.follow_up_notified_at = None
        if lead.next_follow_up_at:
            svc.add_activity(db, lead, "follow_up", "", user,
                             data={"at": as_utc(lead.next_follow_up_at).isoformat()})
    if data.get("status"):
        if data["status"] == "lost" and not data.get("lost_reason"):
            raise bad_request("Choose why the enquiry was lost", "LOST_REASON_REQUIRED", {"lostReason": "Required"})
        svc.set_status(db, lead, data["status"], user, data.get("lost_reason"), data.get("note"))
    elif data.get("note"):
        svc.add_activity(db, lead, "note", data["note"], user)
    audit.record(db, user, "update", "lead", lead.id, before=before, after=_one(db, lead))
    db.commit()
    return _one(db, lead)


@router.post("/leads/{lead_id}/activities", response_model=LeadOut)
def add_activity(lead_id: str, body: ActivityIn, db: DbSession, user: StaffUser):
    lead = _get(db, user, lead_id)
    if body.kind == "note" and not body.body.strip():
        raise bad_request("Write a note", "EMPTY_NOTE", {"body": "Required"})
    svc.add_activity(db, lead, body.kind, body.body.strip(), user, body.outcome)
    if body.kind == "call":
        svc.record_contact(db, lead, user, body.next_follow_up_at)
        if body.outcome == "wrong_number" and lead.status in svc.OPEN:
            svc.set_status(db, lead, "lost", user, "wrong_number")
    elif body.next_follow_up_at:
        lead.next_follow_up_at, lead.follow_up_notified_at = body.next_follow_up_at, None
    db.commit()
    return _one(db, lead)


@router.post("/leads/{lead_id}/whatsapp")
def whatsapp_follow_up(lead_id: str, db: DbSession, user: StaffUser):
    lead = _get(db, user, lead_id)
    if lead.status not in svc.OPEN:
        raise bad_request("This enquiry is closed", "LEAD_CLOSED")
    if not lead.whatsapp_consent:
        raise bad_request("They haven't agreed to WhatsApp messages. Call them, or tick the WhatsApp box once they agree.",
                          "NO_WHATSAPP_CONSENT")
    row = svc.send(db, lead, "lead_followup", actor=user)
    db.commit()
    if row is None:
        raise AppError(409, "Already sent", "ALREADY_SENT")
    return {"status": row.status, "detail": row.error or "Sent", "lead": _one(db, lead)}


@router.post("/leads/{lead_id}/convert")
def convert(lead_id: str, body: ConvertIn, db: DbSession, user: StaffUser):
    """Register the enquiry as a patient (or link an existing patient), ready to book."""
    lead = _get(db, user, lead_id)
    patient = None
    if body.patient_id:
        patient = db.get(Patient, body.patient_id)
        if not patient or (patient.clinic_id and accessible_clinic_ids(user) is not None and patient.clinic_id not in accessible_clinic_ids(user)):
            raise not_found("Patient")
    patient = svc.convert(db, lead, user, patient)
    audit.record(db, user, "convert", "lead", lead.id, after={"patientId": patient.id})
    db.commit()
    return {"patientId": patient.id, "lead": _one(db, lead)}


@router.delete("/leads/{lead_id}", status_code=204)
def delete_lead(lead_id: str, db: DbSession, user: User = Admins):
    """For spam and test entries. Real enquiries that didn't work out should be marked lost instead."""
    lead = _get(db, user, lead_id)
    audit.record(db, user, "delete", "lead", lead.id, before=_one(db, lead))
    db.delete(lead)
    db.commit()


# ---------------------------------------------------------------------------
# Capture links: website form and lead-ad webhook
# ---------------------------------------------------------------------------

def _capture_links(clinic: Clinic, request: Request) -> dict[str, str]:
    s = get_settings()
    api_base = str(request.base_url).rstrip("/")  # behind a proxy, set --forwarded-allow-ips so this is the public URL
    form = f"{s.public_app_url.rstrip('/')}/enquire/{clinic.id}"
    return {
        "formUrl": form,
        "embedCode": f'<iframe src="{form}?embed=1" title="Enquiry form" style="width:100%;max-width:480px;height:640px;border:0"></iframe>',
        "webhookUrl": f"{api_base}{s.api_prefix}/webhooks/leads/{clinic.id}?key={clinic.lead_token}",
        "clinicName": clinic.name,
    }


@router.get("/clinics/{clinic_id}/lead-capture")
def capture_links(clinic_id: str, request: Request, db: DbSession, user: User = Depends(require_roles("super_admin", "admin", "receptionist"))):
    ensure_clinic_access(user, clinic_id)
    clinic = db.get(Clinic, clinic_id)
    if not clinic:
        raise not_found("Clinic")
    if not clinic.lead_token:
        clinic.lead_token = secrets.token_urlsafe(24)
        db.commit()
    return _capture_links(clinic, request)


@router.post("/clinics/{clinic_id}/lead-capture/regenerate")
def regenerate_capture(clinic_id: str, request: Request, db: DbSession, user: User = Admins):
    ensure_clinic_access(user, clinic_id)
    clinic = db.get(Clinic, clinic_id)
    if not clinic:
        raise not_found("Clinic")
    clinic.lead_token = secrets.token_urlsafe(24)
    audit.record(db, user, "regenerate_lead_key", "clinic", clinic.id)
    db.commit()
    return _capture_links(clinic, request)


def _active_clinic(db, clinic_id: str) -> Clinic:
    clinic = db.get(Clinic, clinic_id)
    if not clinic or clinic.status != "active":
        raise not_found("Clinic")
    return clinic


@router.get("/public/enquiry/{clinic_id}")
def public_form(clinic_id: str, request: Request, db: DbSession):
    ratelimit.check(request, "enquiry-view", 60, 600)
    clinic = _active_clinic(db, clinic_id)
    return {"clinicName": clinic.name, "clinicPhone": clinic.phone, "interests": list(svc.INTERESTS),
            "onlineBooking": bool(clinic.online_booking_enabled)}


@router.post("/public/enquiry/{clinic_id}", status_code=201)
def public_enquiry(clinic_id: str, body: PublicEnquiryIn, request: Request, db: DbSession):
    ratelimit.check(request, "enquiry-submit", 5, 600)
    clinic = _active_clinic(db, clinic_id)
    first = body.name.strip().split(" ")[0]
    if body.website:  # a bot filled the hidden field: pretend it worked
        return {"ok": True, "firstName": first}
    if not normalise_phone(body.phone):
        raise bad_request("Enter a valid 10-digit mobile number", "INVALID_PHONE", {"phone": "Invalid number"})
    utm = {k[:40]: str(v)[:200] for k, v in (body.utm or {}).items()}
    source = body.source or _source_from_utm(utm) or "website"
    lead, merged = svc.capture(db, clinic, name=body.name, phone=body.phone, source=source, email=body.email,
                               interest=body.interest, message=body.message, language=body.language,
                               whatsapp_consent=body.whatsapp_consent, campaign=utm or None)
    audit.record(db, None, "public_enquiry", "lead", lead.id, after={"source": source, "merged": merged})
    db.commit()
    return {"ok": True, "firstName": first}


def _source_from_utm(utm: dict[str, str]) -> str | None:
    value = (utm.get("utm_source") or "").lower()
    for key in ("instagram", "facebook", "google", "practo", "justdial"):
        if key in value or (key == "facebook" and value in ("fb", "meta")) or (key == "instagram" and value == "ig"):
            return key
    return None


def _pick(data: dict[str, Any], *keys: str) -> str | None:
    lowered = {str(k).lower(): v for k, v in data.items()}
    for k in keys:
        v = lowered.get(k)
        if v not in (None, ""):
            return str(v)
    return None


@router.post("/webhooks/leads/{clinic_id}", status_code=201)
async def lead_webhook(clinic_id: str, request: Request, db: DbSession, key: str = Query(min_length=10, max_length=100)):
    """Leads from Facebook/Instagram lead forms, Google ads, Practo etc., forwarded by Zapier, Make or similar.

    Send JSON with name, phone and optionally email, source, interest, message, utm_source, utm_campaign.
    """
    ratelimit.check(request, "lead-webhook", 120, 600)
    clinic = db.get(Clinic, clinic_id)
    if not clinic or not clinic.lead_token or not secrets.compare_digest(clinic.lead_token, key):
        raise AppError(401, "Invalid key", "INVALID_KEY")
    try:
        data = await request.json()
    except ValueError:
        raise bad_request("Send JSON", "INVALID_JSON")
    if not isinstance(data, dict):
        raise bad_request("Send a JSON object", "INVALID_JSON")
    name = _pick(data, "name", "full_name", "fullname") or " ".join(filter(None, [_pick(data, "first_name"), _pick(data, "last_name")]))
    phone = _pick(data, "phone", "phone_number", "mobile", "whatsapp")
    if not phone or not normalise_phone(phone):
        raise bad_request("A valid mobile number is required", "INVALID_PHONE", {"phone": "Invalid number"})
    utm = {k: str(v)[:200] for k, v in data.items() if str(k).lower().startswith("utm_") or str(k).lower() in ("campaign", "ad_name", "form_name")}
    source = (_pick(data, "source") or "").lower().replace(" ", "_")
    source = source if source in svc.SOURCES else (_source_from_utm({"utm_source": utm.get("utm_source", "")}) or "other")
    consent = str(_pick(data, "whatsapp_consent", "whatsapp_opt_in") or "").lower() in ("1", "true", "yes", "on")
    lead, merged = svc.capture(db, clinic, name=name or f"+{normalise_phone(phone)}", phone=phone, source=source,
                               email=_pick(data, "email"), interest=(_pick(data, "interest", "treatment", "service") or "")[:100] or None,
                               message=(_pick(data, "message", "comments", "notes") or "")[:2000] or None,
                               whatsapp_consent=consent, campaign=utm or None)
    audit.record(db, None, "webhook_lead", "lead", lead.id, after={"source": source, "merged": merged})
    db.commit()
    return {"id": lead.id, "merged": merged}
