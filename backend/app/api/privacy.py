"""Patient data rights: requests, data copies, consent withdrawal, anonymisation and the access log."""

import json
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import Field
from sqlalchemy import select

from app.api.patients import get_patient_for, portal_patient_ids
from app.core.deps import CurrentUser, DbSession, StaffUser, accessible_clinic_ids, ensure_clinic_access, require_roles
from app.core.errors import AppError, bad_request, not_found
from app.models import DataRequest, Notification, Patient, User
from app.schemas import CamelModel
from app.services import audit
from app.services import privacy as svc

router = APIRouter(tags=["privacy"])
Admins = Depends(require_roles("super_admin", "admin"))
KIND_RE = "^(" + "|".join(svc.KINDS) + ")$"
KIND_LABEL = {"access": "copy of my data", "correction": "correct my data", "erasure": "delete my data",
              "withdraw_consent": "stop messages", "grievance": "complaint"}


class RequestOut(CamelModel):
    id: str
    patient_id: str | None
    patient_name: str | None = None
    clinic_id: str | None
    kind: str
    status: str
    source: str
    details: str
    requester_name: str
    due_on: date
    is_overdue: bool = False
    resolution: str | None
    completed_at: datetime | None
    handled_by_name: str | None = None
    created_at: datetime


class StaffRequestIn(CamelModel):
    patient_id: str
    kind: str = Field(pattern=KIND_RE)
    details: str = Field(default="", max_length=4000)


class PortalRequestIn(CamelModel):
    kind: str = Field(pattern=KIND_RE)
    details: str = Field(default="", max_length=4000)
    patient_id: str | None = None  # a family account holder asking for a member


class RequestUpdate(CamelModel):
    status: str = Field(pattern="^(in_progress|completed|rejected)$")
    resolution: str | None = Field(default=None, max_length=4000)


class AnonymiseIn(CamelModel):
    confirm: str
    override_reason: str | None = Field(default=None, max_length=500)
    request_id: str | None = None


class PrivacySettings(CamelModel):
    clinical_retention_years: int | None = Field(default=None, ge=1, le=30)
    billing_retention_years: int | None = Field(default=None, ge=1, le=30)
    response_days: int | None = Field(default=None, ge=1, le=90)
    log_record_views: bool | None = None
    grievance_officer_name: str | None = Field(default=None, max_length=150)
    grievance_officer_email: str | None = Field(default=None, max_length=255)
    grievance_officer_phone: str | None = Field(default=None, max_length=40)


def _out(db, r: DataRequest) -> RequestOut:
    out = RequestOut.model_validate(r)
    if r.patient_id:
        p = db.get(Patient, r.patient_id)
        out.patient_name = f"{p.first_name} {p.last_name}".strip() if p else None
    if r.handled_by_id:
        u = db.get(User, r.handled_by_id)
        out.handled_by_name = f"{u.first_name} {u.last_name}".strip() if u else None
    out.is_overdue = r.status in ("received", "in_progress") and r.due_on < date.today()
    return out


def _download(data: dict, patient: Patient) -> Response:
    body = json.dumps(data, ensure_ascii=False, indent=2, default=str)
    name = f"patient-data-{patient.id}-{date.today()}.json"
    return Response(body, media_type="application/json", headers={"Content-Disposition": f'attachment; filename="{name}"'})


def _notify_admins(db, clinic_id: str | None, title: str, message: str) -> None:
    for u in db.scalars(select(User).where(User.role.in_(("admin", "super_admin")), User.is_active.is_(True))).unique():
        clinics = {u.clinic_id} | set((u.staff_profile.clinic_ids if u.staff_profile else None) or [])
        if u.role == "super_admin" or (clinic_id and clinic_id in clinics):
            db.add(Notification(user_id=u.id, title=title, message=message))


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

@router.get("/privacy/settings")
def get_settings_(db: DbSession, user: StaffUser):
    return svc.settings(db)


@router.put("/privacy/settings")
def put_settings(body: PrivacySettings, db: DbSession, user: User = Admins):
    result = svc.save_settings(db, body.model_dump(by_alias=True, exclude_unset=True))
    audit.record(db, user, "update", "privacy_settings", "privacy_settings", after=result)
    db.commit()
    return result


# ---------------------------------------------------------------------------
# Requests (staff)
# ---------------------------------------------------------------------------

@router.get("/data-requests", response_model=list[RequestOut])
def list_requests(db: DbSession, user: User = Depends(require_roles("super_admin", "admin", "receptionist")),
                  status: str | None = None, clinic_id: str | None = Query(default=None, alias="clinicId")):
    q = select(DataRequest)
    if clinic_id:
        ensure_clinic_access(user, clinic_id)
        q = q.where(DataRequest.clinic_id == clinic_id)
    else:
        scope = accessible_clinic_ids(user)
        if scope is not None:
            q = q.where(DataRequest.clinic_id.in_(scope))
    if status == "open":
        q = q.where(DataRequest.status.in_(("received", "in_progress")))
    elif status:
        q = q.where(DataRequest.status == status)
    return [_out(db, r) for r in db.scalars(q.order_by(DataRequest.due_on, DataRequest.created_at.desc()).limit(500))]


@router.post("/data-requests", response_model=RequestOut, status_code=201)
def log_request(body: StaffRequestIn, db: DbSession, user: User = Depends(require_roles("super_admin", "admin", "receptionist"))):
    """Record a request made at the desk, by phone or email."""
    patient = get_patient_for(db, user, body.patient_id)
    r = DataRequest(patient_id=patient.id, clinic_id=patient.clinic_id, kind=body.kind, source="staff", details=body.details,
                    requester_name=f"{patient.first_name} {patient.last_name}".strip(), due_on=svc.due_on(db), created_by_id=user.id)
    db.add(r)
    db.flush()
    audit.record(db, user, "create", "data_request", r.id, after=body)
    db.commit()
    return _out(db, r)


@router.patch("/data-requests/{request_id}", response_model=RequestOut)
def update_request(request_id: str, body: RequestUpdate, db: DbSession, user: User = Admins):
    r = db.get(DataRequest, request_id)
    if not r:
        raise not_found("Request")
    ensure_clinic_access(user, r.clinic_id)
    if body.status in ("completed", "rejected") and not (body.resolution or "").strip():
        raise bad_request("Write what was done (or why it was refused). The patient sees this.", "RESOLUTION_REQUIRED",
                          {"resolution": "Required"})
    r.status, r.handled_by_id = body.status, user.id
    if body.resolution is not None:
        r.resolution = body.resolution.strip()
    r.completed_at = datetime.now(timezone.utc) if body.status in ("completed", "rejected") else None
    audit.record(db, user, "update", "data_request", r.id, after=body)
    db.commit()
    return _out(db, r)


# ---------------------------------------------------------------------------
# Per patient (staff)
# ---------------------------------------------------------------------------

@router.get("/patients/{patient_id}/privacy")
def patient_privacy(patient_id: str, db: DbSession, user: StaffUser):
    patient = get_patient_for(db, user, patient_id)
    prefs = patient.communication_prefs or {}
    requests = list(db.scalars(select(DataRequest).where(DataRequest.patient_id == patient.id).order_by(DataRequest.created_at.desc())))
    return {"retention": svc.retention(db, patient), "consentWithdrawnAt": prefs.get("consentWithdrawnAt"),
            "whatsappOptIn": bool(prefs.get("whatsappOptIn")), "requests": [_out(db, r).model_dump(by_alias=True) for r in requests]}


@router.get("/patients/{patient_id}/data-export")
def staff_export(patient_id: str, db: DbSession, user: User = Admins):
    patient = get_patient_for(db, user, patient_id)
    data = svc.export(db, patient)
    audit.record(db, user, "export_data", "patient", patient.id)
    db.commit()
    return _download(data, patient)


@router.get("/patients/{patient_id}/access-log")
def patient_access_log(patient_id: str, db: DbSession, user: User = Admins):
    patient = get_patient_for(db, user, patient_id)
    return svc.access_log(db, patient)


@router.post("/patients/{patient_id}/withdraw-consent")
def withdraw(patient_id: str, db: DbSession, user: User = Depends(require_roles("super_admin", "admin", "receptionist"))):
    patient = get_patient_for(db, user, patient_id)
    result = svc.withdraw_consent(db, patient)
    audit.record(db, user, "withdraw_consent", "patient", patient.id, after=result)
    db.commit()
    return result


@router.post("/patients/{patient_id}/anonymise")
def anonymise(patient_id: str, body: AnonymiseIn, db: DbSession, user: User = Admins):
    patient = get_patient_for(db, user, patient_id)
    if patient.anonymised_at:
        raise AppError(409, "Already anonymised", "ALREADY_ANONYMISED")
    if body.confirm.strip().upper() != "ERASE":
        raise bad_request('Type ERASE to confirm', "CONFIRM_REQUIRED", {"confirm": 'Type ERASE'})
    ret = svc.retention(db, patient)
    if not ret["canErase"]:
        if user.role != "super_admin" or not (body.override_reason or "").strip():
            raise AppError(409, f"Records must be kept until {ret['keepUntil']:%d %b %Y}. You can stop messages now; "
                                "only the platform admin can erase earlier, with a reason.", "RETENTION_PERIOD")
    name = f"{patient.first_name} {patient.last_name}".strip()
    result = svc.anonymise(db, patient)
    if body.request_id:
        r = db.get(DataRequest, body.request_id)
        if r and r.patient_id == patient.id:
            r.status, r.handled_by_id, r.completed_at = "completed", user.id, datetime.now(timezone.utc)
            r.resolution = r.resolution or "Your personal details were erased. Clinical and billing records the law requires us to keep are held without your name or contact details."
    # The audit row keeps no personal data: just that it happened, by whom and why.
    audit.record(db, user, "anonymise", "patient", patient.id,
                 after={**result, "overrideReason": body.override_reason, "retentionUntil": str(ret["keepUntil"] or "")})
    db.commit()
    return {**result, "message": f"{name or 'The patient'} has been anonymised"}


# ---------------------------------------------------------------------------
# Patient portal
# ---------------------------------------------------------------------------

def _portal_patient(db, user: User, patient_id: str | None) -> Patient:
    if user.role != "patient" or not user.patient_id:
        raise AppError(403, "Patients only", "FORBIDDEN")
    pid = patient_id or user.patient_id
    if pid not in portal_patient_ids(db, user):
        raise not_found("Patient")
    return db.get(Patient, pid)


@router.get("/patient-portal/privacy")
def portal_privacy(db: DbSession, user: CurrentUser, patient_id: str | None = Query(default=None, alias="patientId")):
    patient = _portal_patient(db, user, patient_id)
    cfg = svc.settings(db)
    requests = list(db.scalars(select(DataRequest).where(DataRequest.patient_id == patient.id).order_by(DataRequest.created_at.desc())))
    prefs = patient.communication_prefs or {}
    return {
        "grievanceOfficer": {"name": cfg["grievanceOfficerName"], "email": cfg["grievanceOfficerEmail"], "phone": cfg["grievanceOfficerPhone"]},
        "responseDays": cfg["responseDays"],
        "whatsappOptIn": bool(prefs.get("whatsappOptIn")),
        "requests": [{"id": r.id, "kind": r.kind, "status": r.status, "details": r.details, "dueOn": r.due_on,
                      "resolution": r.resolution, "createdAt": r.created_at, "completedAt": r.completed_at} for r in requests],
    }


@router.post("/patient-portal/data-requests", status_code=201)
def portal_request(body: PortalRequestIn, db: DbSession, user: CurrentUser):
    patient = _portal_patient(db, user, body.patient_id)
    if body.kind in ("correction", "grievance") and not body.details.strip():
        raise bad_request("Tell us what needs to change" if body.kind == "correction" else "Tell us what happened",
                          "DETAILS_REQUIRED", {"details": "Required"})
    open_same = db.scalars(select(DataRequest).where(DataRequest.patient_id == patient.id, DataRequest.kind == body.kind,
                                                     DataRequest.status.in_(("received", "in_progress")))).first()
    if open_same:
        raise AppError(409, "You already have this request open. We'll reply soon.", "REQUEST_OPEN")
    r = DataRequest(patient_id=patient.id, clinic_id=patient.clinic_id, kind=body.kind, source="portal", details=body.details.strip(),
                    requester_name=f"{patient.first_name} {patient.last_name}".strip(), due_on=svc.due_on(db), created_by_id=user.id)
    db.add(r)
    db.flush()
    if body.kind == "withdraw_consent":
        # Done straight away: no reason to make anyone wait to stop messages.
        result = svc.withdraw_consent(db, patient)
        r.status, r.completed_at = "completed", datetime.now(timezone.utc)
        r.resolution = "Done. You won't get reminders, recalls or offers on WhatsApp. You can turn reminders back on at the desk."
        audit.record(db, user, "withdraw_consent", "patient", patient.id, after=result)
    else:
        _notify_admins(db, patient.clinic_id, "Data request",
                       f"{r.requester_name} asked to {KIND_LABEL[body.kind]}. Reply by {r.due_on:%d %b}.")
    audit.record(db, user, "create", "data_request", r.id, after={"kind": body.kind})
    db.commit()
    return {"id": r.id, "status": r.status, "dueOn": r.due_on, "resolution": r.resolution}


@router.get("/patient-portal/data-export")
def portal_export(db: DbSession, user: CurrentUser, patient_id: str | None = Query(default=None, alias="patientId")):
    patient = _portal_patient(db, user, patient_id)
    data = svc.export(db, patient)
    audit.record(db, user, "export_data", "patient", patient.id, after={"via": "portal"})
    db.commit()
    return _download(data, patient)
