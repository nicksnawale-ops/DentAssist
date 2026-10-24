"""Recalls (checkups due, unfinished treatment) and Google review settings."""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import Field
from sqlalchemy import func, select

from app.core.deps import DbSession, StaffUser, accessible_clinic_ids, ensure_clinic_access, require_roles
from app.core.errors import bad_request, not_found
from app.models import Appointment, Clinic, MessageLog, Patient, Recall, TreatmentPlan, User
from app.schemas import CamelModel
from app.services import audit
from app.services import recalls as svc
from app.services.whatsapp import normalise_phone

router = APIRouter(tags=["recalls"])
Admins = Depends(require_roles("super_admin", "admin"))
FrontDesk = Depends(require_roles("super_admin", "admin", "receptionist", "dentist"))


class RecallOut(CamelModel):
    id: str
    patient_id: str
    patient_name: str
    phone: str | None
    whatsapp_opt_in: bool
    clinic_id: str
    kind: str
    treatment_plan_id: str | None
    treatment_plan_name: str | None = None
    due_date: date
    status: str
    reason: str
    last_visit_at: datetime | None
    contact_count: int
    last_contacted_at: datetime | None
    appointment_id: str | None
    booked_at: datetime | None
    notes: str | None
    is_due: bool
    created_at: datetime


class RecallUpdate(CamelModel):
    status: str | None = Field(default=None, pattern="^(due|dismissed)$")
    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=1000)


class BulkSendIn(CamelModel):
    ids: list[str] = Field(min_length=1, max_length=200)


class SendOut(CamelModel):
    id: str
    status: str
    detail: str


class RecallSettings(CamelModel):
    checkup_interval_months: int | None = Field(default=None, ge=1, le=24)
    treatment_followup_days: int | None = Field(default=None, ge=1, le=180)
    remind_again_days: int | None = Field(default=None, ge=1, le=90)
    auto_send_recalls: bool | None = None
    review_requests_enabled: bool | None = None
    review_delay_hours: float | None = Field(default=None, ge=0, le=48)
    review_cooldown_days: int | None = Field(default=None, ge=1, le=730)


class RecallSummary(CamelModel):
    due: int
    contacted: int
    booked_last_30_days: int
    review_requests_last_30_days: int


class ReviewLinkIn(CamelModel):
    google_review_url: str | None = Field(default=None, max_length=500, pattern=r"^(https://\S+)?$")


_TO_SNAKE = {"checkup_interval_months": "checkupIntervalMonths", "treatment_followup_days": "treatmentFollowupDays",
             "remind_again_days": "remindAgainDays", "auto_send_recalls": "autoSendRecalls",
             "review_requests_enabled": "reviewRequestsEnabled", "review_delay_hours": "reviewDelayHours",
             "review_cooldown_days": "reviewCooldownDays"}


def _settings_out(cfg: dict) -> RecallSettings:
    return RecallSettings(**{snake: cfg[camel] for snake, camel in _TO_SNAKE.items()})


def _scoped(user: User, query):
    allowed = accessible_clinic_ids(user)
    return query if allowed is None else query.where(Recall.clinic_id.in_(allowed))


def _get(db, user: User, recall_id: str) -> Recall:
    r = db.get(Recall, recall_id)
    allowed = accessible_clinic_ids(user)
    if not r or (allowed is not None and r.clinic_id not in allowed):
        raise not_found("Recall")
    return r


def _out(db, rows: list[Recall]) -> list[RecallOut]:
    cfg = svc.settings(db)
    today = datetime.now(timezone.utc).date()
    pids = {r.patient_id for r in rows}
    patients = {p.id: p for p in db.scalars(select(Patient).where(Patient.id.in_(pids)))} if pids else {}
    plan_ids = {r.treatment_plan_id for r in rows if r.treatment_plan_id}
    plans = {p.id: p.name for p in db.scalars(select(TreatmentPlan).where(TreatmentPlan.id.in_(plan_ids)))} if plan_ids else {}
    out = []
    for r in rows:
        p = patients.get(r.patient_id)
        out.append(RecallOut(
            id=r.id, patient_id=r.patient_id, patient_name=f"{p.first_name} {p.last_name}".strip() if p else "Patient",
            phone=p.phone if p else None,
            whatsapp_opt_in=bool(p and (p.communication_prefs or {}).get("whatsappOptIn")) and bool(normalise_phone(p.phone if p else None)),
            clinic_id=r.clinic_id, kind=r.kind, treatment_plan_id=r.treatment_plan_id,
            treatment_plan_name=plans.get(r.treatment_plan_id), due_date=r.due_date, status=r.status, reason=r.reason,
            last_visit_at=r.last_visit_at, contact_count=r.contact_count, last_contacted_at=r.last_contacted_at,
            appointment_id=r.appointment_id, booked_at=r.booked_at, notes=r.notes,
            is_due=svc.due_now(db, r, today, cfg), created_at=r.created_at,
        ))
    return out


@router.get("/recalls", response_model=list[RecallOut])
def list_recalls(
    db: DbSession,
    user: StaffUser,
    clinic_id: str | None = Query(default=None, alias="clinicId"),
    status: str | None = None,
    kind: str | None = None,
    patient_id: str | None = Query(default=None, alias="patientId"),
):
    # Keep the list honest: close anything booked since the last look.
    svc.refresh_recalls(db, accessible_clinic_ids(user))
    db.commit()
    query = _scoped(user, select(Recall))
    if clinic_id and clinic_id != "all":
        ensure_clinic_access(user, clinic_id)
        query = query.where(Recall.clinic_id == clinic_id)
    if status:
        query = query.where(Recall.status.in_(status.split(",")))
    if kind:
        query = query.where(Recall.kind == kind)
    if patient_id:
        query = query.where(Recall.patient_id == patient_id)
    rows = db.scalars(query.order_by(Recall.due_date, Recall.created_at).limit(1000)).all()
    return _out(db, rows)


@router.get("/recalls/summary", response_model=RecallSummary)
def summary(db: DbSession, user: StaffUser, clinic_id: str | None = Query(default=None, alias="clinicId")):
    since = datetime.now(timezone.utc) - timedelta(days=30)
    base = _scoped(user, select(func.count()).select_from(Recall))
    if clinic_id and clinic_id != "all":
        ensure_clinic_access(user, clinic_id)
        base = base.where(Recall.clinic_id == clinic_id)
    reviews = select(func.count()).select_from(MessageLog).where(
        MessageLog.kind == "review_request", MessageLog.status.in_(("sent", "delivered", "read")),
        MessageLog.created_at >= since)
    allowed = accessible_clinic_ids(user) if not (clinic_id and clinic_id != "all") else {clinic_id}
    if allowed is not None:
        reviews = reviews.where(MessageLog.appointment_id.in_(select(Appointment.id).where(Appointment.clinic_id.in_(allowed))))
    return RecallSummary(
        due=db.scalar(base.where(Recall.status == "due")) or 0,
        contacted=db.scalar(base.where(Recall.status == "contacted")) or 0,
        booked_last_30_days=db.scalar(base.where(Recall.status == "booked", Recall.booked_at >= since)) or 0,
        review_requests_last_30_days=db.scalar(reviews) or 0,
    )


@router.post("/recalls/refresh")
def refresh(db: DbSession, user: StaffUser):
    counts = svc.refresh_recalls(db, accessible_clinic_ids(user))
    db.commit()
    return counts


@router.post("/recalls/run-jobs")
def run_jobs(db: DbSession, user: User = Depends(require_roles("super_admin"))):
    """Run the background job now: refresh recalls, auto-send due ones, send review requests."""
    return svc.run_jobs(db)


@router.patch("/recalls/{recall_id}", response_model=RecallOut)
def update_recall(recall_id: str, body: RecallUpdate, db: DbSession, user: User = FrontDesk):
    r = _get(db, user, recall_id)
    if r.status == "booked":
        raise bad_request("This recall is already booked", "RECALL_BOOKED")
    if body.status:
        r.status = body.status
    if body.due_date:
        r.due_date = body.due_date
        if r.status == "contacted":
            r.status = "due"
    if body.notes is not None:
        r.notes = body.notes.strip() or None
    audit.record(db, user, "update", "recall", r.id, after=body.model_dump(exclude_none=True, mode="json"))
    db.commit()
    return _out(db, [r])[0]


@router.post("/recalls/{recall_id}/send", response_model=SendOut)
def send_one(recall_id: str, db: DbSession, user: User = FrontDesk):
    r = _get(db, user, recall_id)
    if r.status not in svc.OPEN:
        raise bad_request("Only open recalls can be sent", "RECALL_CLOSED")
    row = svc.send_recall(db, r, user)
    db.commit()
    if row is None:
        return SendOut(id=r.id, status="skipped", detail="Patient not found")
    return SendOut(id=r.id, status=row.status, detail="Sent on WhatsApp" if row.status == "sent" else (row.error or row.status))


@router.post("/recalls/send", response_model=list[SendOut])
def send_many(body: BulkSendIn, db: DbSession, user: User = FrontDesk):
    out = []
    for rid in dict.fromkeys(body.ids):
        r = db.get(Recall, rid)
        allowed = accessible_clinic_ids(user)
        if not r or (allowed is not None and r.clinic_id not in allowed) or r.status not in svc.OPEN:
            out.append(SendOut(id=rid, status="skipped", detail="Not an open recall"))
            continue
        row = svc.send_recall(db, r, user)
        out.append(SendOut(id=rid, status=row.status if row else "skipped",
                           detail="Sent on WhatsApp" if row and row.status == "sent" else ((row.error if row else None) or "Not sent")))
    db.commit()
    return out


@router.get("/recalls/settings", response_model=RecallSettings)
def get_settings_(db: DbSession, user: StaffUser):
    return _settings_out(svc.settings(db))


@router.put("/recalls/settings", response_model=RecallSettings)
def put_settings(body: RecallSettings, db: DbSession, user: User = Admins):
    changes = {camel: getattr(body, snake) for snake, camel in _TO_SNAKE.items()}
    cfg = svc.save_settings(db, changes)
    audit.record(db, user, "update", "recall_settings", "recall_settings", after=cfg)
    db.commit()
    return _settings_out(cfg)


@router.put("/clinics/{clinic_id}/google-review-url")
def set_review_link(clinic_id: str, body: ReviewLinkIn, db: DbSession, user: User = Admins):
    """Clinic admins can set their own Google review link (full clinic edits are super-admin only)."""
    ensure_clinic_access(user, clinic_id)
    clinic = db.get(Clinic, clinic_id)
    if not clinic:
        raise not_found("Clinic")
    clinic.google_review_url = (body.google_review_url or "").strip() or None
    audit.record(db, user, "update", "clinic", clinic.id, after={"googleReviewUrl": clinic.google_review_url})
    db.commit()
    return {"googleReviewUrl": clinic.google_review_url}
