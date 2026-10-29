"""Dashboard summaries, shaped exactly like the frontend's mockDashboardStats.

Figures that depend on modules not yet moved to the backend (billing revenue,
inventory, treatment plans, lab orders) return 0 / empty for now.
"""

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, DbSession, accessible_clinic_ids, require_roles
from app.core.errors import forbidden
from app.models import Appointment, AuditLog, Clinic, Invoice, Patient, Payment, User
from app.schemas import money
from app.services.scheduling import ACTIVE_STATUSES, as_utc

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

DEFAULT_TZ = "Asia/Kolkata"
QUEUE_STATUS = {"scheduled": "waiting", "confirmed": "waiting", "in_progress": "in-progress", "completed": "completed"}


def _tz(db: Session, user: User) -> ZoneInfo:
    clinic = db.get(Clinic, user.clinic_id) if user.clinic_id else None
    try:
        return ZoneInfo((clinic.timezone if clinic else None) or DEFAULT_TZ)
    except Exception:
        return ZoneInfo(DEFAULT_TZ)


def _day_bounds(tz: ZoneInfo, days_back: int = 0) -> tuple[datetime, datetime]:
    today = datetime.now(tz).date() - timedelta(days=days_back)
    start = datetime.combine(today, time.min, tzinfo=tz)
    return start.astimezone(timezone.utc), (start + timedelta(days=1)).astimezone(timezone.utc)


def _collections(db: Session, since: datetime, clinic_ids: set[str] | None) -> dict[str, float]:
    """Payments received since a moment, per clinic."""
    query = (
        select(Invoice.clinic_id, func.coalesce(func.sum(Payment.amount), 0))
        .join(Invoice, Invoice.id == Payment.invoice_id)
        .where(Payment.paid_at >= since)
        .group_by(Invoice.clinic_id)
    )
    if clinic_ids is not None:
        query = query.where(Invoice.clinic_id.in_(clinic_ids))
    return {cid: float(total) for cid, total in db.execute(query).all()}


def _month_start(tz: ZoneInfo, months_back: int = 0) -> datetime:
    local = datetime.now(tz)
    year, month = local.year, local.month - months_back
    while month <= 0:
        month += 12
        year -= 1
    return datetime(year, month, 1, tzinfo=tz).astimezone(timezone.utc)


def _clock(dt: datetime, tz: ZoneInfo) -> str:
    return as_utc(dt).astimezone(tz).strftime("%I:%M %p")


def _name(first: str, last: str) -> str:
    return f"{first} {last}".strip()


def _ago(dt: datetime) -> str:
    seconds = int((datetime.now(timezone.utc) - as_utc(dt)).total_seconds())
    if seconds < 60:
        return "just now"
    if seconds < 3600:
        return f"{seconds // 60} mins ago"
    if seconds < 86400:
        hours = seconds // 3600
        return f"{hours} hour{'s' if hours > 1 else ''} ago"
    days = seconds // 86400
    return f"{days} day{'s' if days > 1 else ''} ago"


def _todays_appointments(db: Session, user: User, tz: ZoneInfo, dentist_id: str | None = None):
    start, end = _day_bounds(tz)
    query = (
        select(Appointment, Patient)
        .join(Patient, Patient.id == Appointment.patient_id)
        .where(Appointment.start_time >= start, Appointment.start_time < end)
        .order_by(Appointment.start_time)
    )
    allowed = accessible_clinic_ids(user)
    if allowed is not None:
        query = query.where(Appointment.clinic_id.in_(allowed))
    if dentist_id:
        query = query.where(Appointment.dentist_id == dentist_id)
    return db.execute(query).all()


@router.get("/super_admin")
def super_admin_dashboard(db: DbSession, user: User = Depends(require_roles("super_admin"))):
    tz = _tz(db, user)
    start, end = _day_bounds(tz)
    clinics = db.scalars(select(Clinic).order_by(Clinic.name)).all()
    patients_by_clinic = dict(db.execute(select(Patient.clinic_id, func.count()).group_by(Patient.clinic_id)).all())
    activity = db.execute(
        select(AuditLog, User).outerjoin(User, User.id == AuditLog.actor_user_id)
        .where(AuditLog.action.not_like("view%")).order_by(AuditLog.timestamp.desc()).limit(5)
    ).all()
    this_month = _collections(db, _month_start(tz), None)
    trend = []
    for back in range(5, -1, -1):
        start_m, end_m = _month_start(tz, back), _month_start(tz, back - 1) if back > 0 else None
        q = select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.paid_at >= start_m)
        if end_m:
            q = q.where(Payment.paid_at < end_m)
        trend.append({"name": start_m.astimezone(tz).strftime("%b"), "revenue": float(db.scalar(q) or 0)})
    return {
        "totalClinics": sum(1 for c in clinics if c.status == "active"),
        "activePatients": db.scalar(select(func.count()).select_from(Patient)) or 0,
        "todayAppointments": db.scalar(
            select(func.count()).select_from(Appointment).where(
                Appointment.start_time >= start, Appointment.start_time < end,
                Appointment.status.not_in(["cancelled", "no_show"]),
            )
        ) or 0,
        "revenueTrend": trend,
        "topClinics": sorted(
            [{"id": c.id, "name": c.name, "revenue": this_month.get(c.id, 0.0), "patients": patients_by_clinic.get(c.id, 0)}
             for c in clinics],
            key=lambda c: (c["revenue"], c["patients"]), reverse=True,
        )[:5],
        "recentActivity": [
            {
                "id": log.id,
                "text": f"{_name(actor.first_name, actor.last_name) if actor else 'System'} "
                        f"{log.action.replace('_', ' ')} {log.entity_type}",
                "time": _ago(log.timestamp),
            }
            for log, actor in activity
        ],
    }


def _low_stock_count(db, user: User) -> int:
    from app.models import InventoryItem

    query = select(func.count()).select_from(InventoryItem).where(
        InventoryItem.is_active.is_(True), InventoryItem.current_stock <= InventoryItem.reorder_threshold)
    allowed = accessible_clinic_ids(user)
    if allowed is not None:
        query = query.where(InventoryItem.clinic_id.in_(allowed))
    return db.scalar(query) or 0


@router.get("/dentist")
def dentist_dashboard(db: DbSession, user: User = Depends(require_roles("dentist", "admin"))):
    tz = _tz(db, user)
    rows = _todays_appointments(db, user, tz, dentist_id=user.id)
    active = [(a, p) for a, p in rows if a.status not in ("cancelled", "no_show")]
    now = datetime.now(timezone.utc)
    upcoming = [(a, p) for a, p in active if a.status in ACTIVE_STATUSES and as_utc(a.end_time) > now]
    week_start, _ = _day_bounds(tz, days_back=datetime.now(tz).weekday())
    seen = db.scalar(
        select(func.count(func.distinct(Appointment.patient_id))).where(
            Appointment.dentist_id == user.id, Appointment.status == "completed", Appointment.start_time >= week_start
        )
    ) or 0

    next_patient = None
    if upcoming:
        a, p = upcoming[0]
        allergies = (p.medical_history or {}).get("allergies") or []
        next_patient = {
            "id": a.id, "patientId": p.id, "name": _name(p.first_name, p.last_name),
            "time": _clock(a.start_time, tz), "procedure": a.procedure_type,
            "notes": f"Allergic to {', '.join(allergies)}." if allergies else (a.notes or "No alerts."),
        }
    return {
        "patientsSeenThisWeek": seen,
        "pendingTreatmentPlans": 0,
        "todayRevenue": sum(_collections(db, _day_bounds(tz)[0], accessible_clinic_ids(user)).values()),
        "lowInventoryItems": _low_stock_count(db, user),
        "todaySchedule": [
            {"id": a.id, "patientId": p.id, "time": _clock(a.start_time, tz),
             "patientName": _name(p.first_name, p.last_name), "procedure": a.procedure_type, "status": a.status}
            for a, p in active
        ],
        "nextPatient": next_patient,
    }


@router.get("/receptionist")
def receptionist_dashboard(db: DbSession, user: User = Depends(require_roles("receptionist", "admin", "super_admin"))):
    tz = _tz(db, user)
    rows = _todays_appointments(db, user, tz)
    allowed = accessible_clinic_ids(user)
    pending = select(func.count()).select_from(Patient).where(Patient.outstanding_balance > 0)
    if allowed is not None:
        pending = pending.where(Patient.clinic_id.in_(allowed))
    return {
        "pendingPayments": db.scalar(pending) or 0,
        "lowInventoryItems": _low_stock_count(db, user),
        "queue": [
            {"id": a.id, "patientId": p.id, "patientName": _name(p.first_name, p.last_name),
             "time": _clock(a.start_time, tz),
             "status": "checked-in" if a.arrived_at and a.status in ("scheduled", "confirmed") else QUEUE_STATUS[a.status],
             "arrivedAt": a.arrived_at,
             "waitingMinutes": int((datetime.now(timezone.utc) - as_utc(a.arrived_at)).total_seconds() // 60)
             if a.arrived_at and a.status in ("scheduled", "confirmed") else None}
            for a, p in rows if a.status in QUEUE_STATUS
        ],
    }


@router.get("/patient")
def patient_dashboard(user: CurrentUser, db: DbSession):
    if user.role != "patient" or not user.patient_id:
        raise forbidden()
    patient = db.get(Patient, user.patient_id)
    now = datetime.now(timezone.utc)

    nxt = db.execute(
        select(Appointment, Clinic, User)
        .join(Clinic, Clinic.id == Appointment.clinic_id)
        .join(User, User.id == Appointment.dentist_id)
        .where(Appointment.patient_id == user.patient_id, Appointment.start_time >= now,
               Appointment.status.in_(["scheduled", "confirmed"]))
        .order_by(Appointment.start_time).limit(1)
    ).first()
    last = db.scalars(
        select(Appointment).where(Appointment.patient_id == user.patient_id, Appointment.status == "completed")
        .order_by(Appointment.start_time.desc()).limit(1)
    ).first()

    next_appointment = None
    if nxt:
        a, clinic, dentist = nxt
        tz = ZoneInfo(clinic.timezone or DEFAULT_TZ)
        addr = clinic.address or {}
        next_appointment = {
            "id": a.id,
            "clinicName": clinic.name,
            "address": ", ".join(str(addr[k]) for k in ("street", "city", "state", "pincode") if addr.get(k)),
            "date": as_utc(a.start_time).astimezone(tz).strftime("%b %d, %Y"),
            "time": _clock(a.start_time, tz),
            "providerName": f"Dr. {_name(dentist.first_name, dentist.last_name)}",
        }
    return {
        "nextAppointment": next_appointment,
        "recentTreatment": {
            "procedure": last.procedure_type,
            "date": as_utc(last.start_time).astimezone(ZoneInfo(DEFAULT_TZ)).strftime("%b %d, %Y"),
            "notes": last.notes or "",
        } if last else None,
        "outstandingBalance": money(patient.outstanding_balance if patient else 0),
        "pendingLabOrder": None,
    }
