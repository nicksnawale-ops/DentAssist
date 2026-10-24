from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, bad_request, not_found
from app.models import Appointment, Clinic, User

ACTIVE_STATUSES = ("scheduled", "confirmed", "in_progress")
DENTIST_ROLES = ("dentist", "admin")


def as_utc(dt: datetime) -> datetime:
    """Treat naive datetimes as UTC so comparisons never mix naive and aware values."""
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def validate_dentist_and_clinic(db: Session, dentist_id: str, clinic_id: str) -> tuple[User, Clinic]:
    clinic = db.get(Clinic, clinic_id)
    if not clinic:
        raise not_found("Clinic")
    if clinic.status != "active":
        raise bad_request("This clinic is not accepting appointments", "CLINIC_INACTIVE")
    dentist = db.get(User, dentist_id)
    if not dentist or dentist.role not in DENTIST_ROLES or not dentist.is_active:
        raise not_found("Dentist")
    profile = dentist.staff_profile
    works_here = dentist.clinic_id == clinic_id or (profile and clinic_id in (profile.clinic_ids or []))
    if not works_here:
        raise bad_request("This dentist does not work at the selected clinic", "DENTIST_NOT_AT_CLINIC")
    if profile and profile.status != "active":
        raise bad_request("This dentist is not currently available", "DENTIST_UNAVAILABLE")
    return dentist, clinic


def find_overlaps(db: Session, dentist_id: str, start: datetime, end: datetime,
                  exclude_id: str | None = None) -> list[Appointment]:
    start, end = as_utc(start), as_utc(end)
    query = select(Appointment).where(
        Appointment.dentist_id == dentist_id,
        Appointment.status.in_(ACTIVE_STATUSES),
        Appointment.start_time < end,
        Appointment.end_time > start,
    )
    if exclude_id:
        query = query.where(Appointment.id != exclude_id)
    return list(db.scalars(query))


def ensure_no_overlap(db: Session, dentist_id: str, start: datetime, end: datetime,
                      exclude_id: str | None = None) -> None:
    clashes = find_overlaps(db, dentist_id, start, end, exclude_id)
    if clashes:
        raise AppError(
            409,
            "The dentist already has an appointment at this time",
            "APPOINTMENT_CONFLICT",
            {"startTime": f"Overlaps appointment {clashes[0].id}"},
        )
