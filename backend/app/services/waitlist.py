"""When an appointment is cancelled or moved, tell the front desk if someone on
the waitlist could take the freed slot."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Appointment, Clinic, Notification, Patient, User, WaitlistEntry
from app.services.availability import clinic_tz
from app.services.scheduling import as_utc


def matches_for(db: Session, appt: Appointment) -> list[tuple[WaitlistEntry, Patient]]:
    rows = db.execute(
        select(WaitlistEntry, Patient)
        .join(Patient, Patient.id == WaitlistEntry.patient_id)
        .where(WaitlistEntry.clinic_id == appt.clinic_id, WaitlistEntry.status == "waiting",
               WaitlistEntry.patient_id != appt.patient_id)
        .order_by(WaitlistEntry.created_at)
    ).all()
    return [(w, p) for w, p in rows if w.preferred_dentist_id in (None, appt.dentist_id)]


def notify_slot_freed(db: Session, appt: Appointment) -> int:
    """Add a notification for the clinic's front desk. Returns how many waitlist patients match."""
    if as_utc(appt.start_time) <= datetime.now(timezone.utc):
        return 0
    matches = matches_for(db, appt)
    if not matches:
        return 0
    clinic = db.get(Clinic, appt.clinic_id)
    dentist = db.get(User, appt.dentist_id)
    when = as_utc(appt.start_time).astimezone(clinic_tz(clinic)).strftime("%a %d %b, %I:%M %p")
    who = f"Dr. {dentist.first_name} {dentist.last_name}" if dentist else "A dentist"
    names = ", ".join(f"{p.first_name} {p.last_name}" for _, p in matches[:3])
    more = f" and {len(matches) - 3} more" if len(matches) > 3 else ""
    message = f"{who} is free on {when}. On the waitlist: {names}{more}."

    recipients = [
        u for u in db.scalars(select(User).where(User.role.in_(["receptionist", "admin"]), User.is_active.is_(True))).unique()
        if appt.clinic_id in ({u.clinic_id} | set((u.staff_profile.clinic_ids if u.staff_profile else None) or []))
    ]
    for u in recipients:
        db.add(Notification(user_id=u.id, title="A slot opened up", message=message))
    return len(matches)
