"""Recalls (patients who should come back) and Google review requests.

Recalls are created by `refresh_recalls`, which is safe to run any time:
- checkup: last completed visit is older than the checkup interval (default 6 months)
- treatment: an approved / in-progress plan still has pending items and nothing is booked

A recall closes itself as "booked" as soon as the patient has an upcoming appointment, whichever
way it was booked (front desk, portal, online page, WhatsApp).
"""

from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import AppSetting, Appointment, Clinic, MessageLog, Patient, Recall, TreatmentPlan
from app.services import messaging as msg
from app.services.availability import clinic_tz
from app.services.scheduling import as_utc

DEFAULT_SETTINGS: dict[str, Any] = {
    "checkupIntervalMonths": 6,
    "treatmentFollowupDays": 14,  # chase an unfinished plan once nothing has happened for this long
    "remindAgainDays": 14,  # a contacted recall becomes due again after this many days
    "autoSendRecalls": False,  # send due recalls automatically (once each) from the background job
    "reviewRequestsEnabled": True,
    "reviewDelayHours": 2,  # after the visit ends
    "reviewCooldownDays": 180,  # never ask the same patient more often than this
}
OPEN = ("due", "contacted")
ACTIVE_APPT = ("scheduled", "confirmed", "in_progress")


def settings(db: Session) -> dict[str, Any]:
    row = db.get(AppSetting, "recall_settings")
    return {**DEFAULT_SETTINGS, **((row.value if row else None) or {})}


def save_settings(db: Session, changes: dict[str, Any]) -> dict[str, Any]:
    current = settings(db)
    current.update({k: v for k, v in changes.items() if k in DEFAULT_SETTINGS and v is not None})
    row = db.get(AppSetting, "recall_settings")
    if row:
        row.value = current
    else:
        db.add(AppSetting(key="recall_settings", value=current))
    return current


def _add_months(d: date, months: int) -> date:
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    for day in (d.day, 30, 29, 28):
        try:
            return date(year, month, day)
        except ValueError:
            continue
    return date(year, month, 28)


# ---------------------------------------------------------------------------
# Building the list
# ---------------------------------------------------------------------------

def _upcoming_by_patient(db: Session, now: datetime) -> dict[str, Appointment]:
    rows = db.scalars(select(Appointment).where(Appointment.status.in_(ACTIVE_APPT), Appointment.start_time >= now)
                      .order_by(Appointment.start_time)).all()
    out: dict[str, Appointment] = {}
    for a in rows:
        out.setdefault(a.patient_id, a)
    return out


def _close_booked(db: Session, upcoming: dict[str, Appointment], now: datetime) -> int:
    closed = 0
    for r in db.scalars(select(Recall).where(Recall.status.in_(OPEN))):
        appt = upcoming.get(r.patient_id)
        if appt:
            r.status, r.appointment_id, r.booked_at = "booked", appt.id, now
            closed += 1
    return closed


def refresh_recalls(db: Session, clinic_ids: set[str] | None = None, now: datetime | None = None) -> dict[str, int]:
    """Create missing recalls and close the ones that got booked. Idempotent."""
    now = now or datetime.now(timezone.utc)
    cfg = settings(db)
    upcoming = _upcoming_by_patient(db, now)
    closed = _close_booked(db, upcoming, now)
    created = 0

    open_keys = {(r.patient_id, r.kind, r.treatment_plan_id) for r in db.scalars(select(Recall).where(Recall.status.in_(OPEN)))}

    # Routine checkups
    last_visits = db.execute(
        select(Appointment.patient_id, Appointment.clinic_id, func.max(Appointment.start_time))
        .where(Appointment.status == "completed")
        .group_by(Appointment.patient_id, Appointment.clinic_id)
    ).all()
    latest: dict[str, tuple[str, datetime]] = {}
    for pid, cid, last in last_visits:
        if pid not in latest or as_utc(last) > as_utc(latest[pid][1]):
            latest[pid] = (cid, last)
    # Recently dismissed or booked checkups shouldn't come straight back.
    recent_closed = {
        r.patient_id for r in db.scalars(select(Recall).where(
            Recall.kind == "checkup", Recall.status.in_(("dismissed", "booked")),
            Recall.updated_at >= now - timedelta(days=30 * cfg["checkupIntervalMonths"] // 2)))
    }
    for pid, (cid, last) in latest.items():
        if clinic_ids is not None and cid not in clinic_ids:
            continue
        due = _add_months(as_utc(last).date(), int(cfg["checkupIntervalMonths"]))
        if due > now.date() + timedelta(days=14) or pid in upcoming or pid in recent_closed:
            continue
        if (pid, "checkup", None) in open_keys:
            continue
        db.add(Recall(patient_id=pid, clinic_id=cid, kind="checkup", due_date=due, last_visit_at=as_utc(last),
                      reason=f"Last checkup {as_utc(last).strftime('%d %b %Y')}"))
        open_keys.add((pid, "checkup", None))
        created += 1

    # Unfinished treatment plans
    plans = db.scalars(select(TreatmentPlan).where(TreatmentPlan.status.in_(("Approved", "In Progress")))).all()
    for plan in plans:
        if clinic_ids is not None and plan.clinic_id not in clinic_ids:
            continue
        pending = [i for i in plan.items if i.status == "Pending"]
        if not pending or plan.patient_id in upcoming or (plan.patient_id, "treatment", plan.id) in open_keys:
            continue
        last_activity = max([as_utc(plan.updated_at)] + [as_utc(i.completed_at) for i in plan.items if i.completed_at])
        if last_activity > now - timedelta(days=int(cfg["treatmentFollowupDays"])):
            continue
        db.add(Recall(patient_id=plan.patient_id, clinic_id=plan.clinic_id, kind="treatment", treatment_plan_id=plan.id,
                      due_date=now.date(), reason=f"{len(pending)} of {len(plan.items)} steps left in {plan.name}"))
        open_keys.add((plan.patient_id, "treatment", plan.id))
        created += 1

    db.flush()
    return {"created": created, "booked": closed}


# ---------------------------------------------------------------------------
# Contacting
# ---------------------------------------------------------------------------

def booking_link(clinic: Clinic) -> str:
    return f"{get_settings().public_app_url.rstrip('/')}/book/{clinic.id}"


def send_recall(db: Session, recall: Recall, actor=None) -> MessageLog | None:
    patient = db.get(Patient, recall.patient_id)
    clinic = db.get(Clinic, recall.clinic_id)
    if not patient or not clinic:
        return None
    link = booking_link(clinic)
    if recall.kind == "treatment":
        plan = db.get(TreatmentPlan, recall.treatment_plan_id) if recall.treatment_plan_id else None
        key, params = "recall_treatment", [msg._first_name(patient), plan.name if plan else "treatment", clinic.name, link]
    else:
        key, params = "recall_checkup", [msg._first_name(patient), clinic.name, link]
    row = msg.send_template(db, patient, key, params, actor=actor, payload={"recallId": recall.id, "clinicId": clinic.id})
    if row is not None and row.status == "sent":
        recall.status = "contacted"
        recall.contact_count += 1
        recall.last_contacted_at = datetime.now(timezone.utc)
    return row


def due_now(db: Session, recall: Recall, today: date, cfg: dict[str, Any]) -> bool:
    if recall.status == "due":
        return recall.due_date <= today
    if recall.status == "contacted" and recall.last_contacted_at:
        return as_utc(recall.last_contacted_at).date() + timedelta(days=int(cfg["remindAgainDays"])) <= today
    return False


def auto_send_recalls(db: Session, now: datetime) -> int:
    """Background job: contact each due recall once, between 10am and 7pm clinic time."""
    cfg = settings(db)
    if not cfg["autoSendRecalls"]:
        return 0
    sent = 0
    for r in db.scalars(select(Recall).where(Recall.status == "due", Recall.contact_count == 0,
                                             Recall.due_date <= now.date())).all():
        clinic = db.get(Clinic, r.clinic_id)
        if not clinic or not 10 <= now.astimezone(clinic_tz(clinic)).hour < 19:
            continue
        row = send_recall(db, r)
        sent += 1 if row is not None and row.status == "sent" else 0
    return sent


def send_review_requests(db: Session, now: datetime) -> int:
    """Background job: ask for a Google review a couple of hours after a completed visit."""
    cfg = settings(db)
    if not cfg["reviewRequestsEnabled"]:
        return 0
    delay = timedelta(hours=float(cfg["reviewDelayHours"]))
    appts = db.scalars(select(Appointment).where(
        Appointment.status == "completed",
        Appointment.end_time <= now - delay, Appointment.end_time >= now - timedelta(hours=48),
        Appointment.updated_at >= now - timedelta(hours=48),
    )).all()
    sent = 0
    cooldown = now - timedelta(days=int(cfg["reviewCooldownDays"]))
    for appt in appts:
        clinic = db.get(Clinic, appt.clinic_id)
        patient = db.get(Patient, appt.patient_id)
        if not clinic or not clinic.google_review_url or not patient:
            continue
        asked = db.scalars(select(MessageLog.id).where(
            MessageLog.patient_id == patient.id, MessageLog.kind == "review_request",
            MessageLog.status.in_(("sent", "delivered", "read")), MessageLog.created_at >= cooldown)).first()
        if asked:
            continue
        row = msg.send_template(db, patient, "review_request",
                                [msg._first_name(patient), clinic.name, clinic.google_review_url],
                                appointment_id=appt.id, dedupe_key=f"{appt.id}:review_request")
        sent += 1 if row is not None and row.status == "sent" else 0
    return sent


def run_jobs(db: Session, now: datetime | None = None) -> dict[str, int]:
    now = now or datetime.now(timezone.utc)
    counts = refresh_recalls(db, now=now)
    counts["recallsSent"] = auto_send_recalls(db, now)
    counts["reviewRequests"] = send_review_requests(db, now)
    db.commit()
    return counts
