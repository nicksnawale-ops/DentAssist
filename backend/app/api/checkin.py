"""QR self check-in at reception.

A poster at the front desk has a QR code for /checkin/<clinic id>?t=<key>. The patient scans it, enters
their mobile number, picks their appointment from today's list (first names are masked) and taps
"I'm here". The front desk queue shows them as arrived, and the dentist gets a notification.
"""

import secrets
from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, Request
from pydantic import Field
from sqlalchemy import select

from app.core.config import get_settings
from app.core.deps import DbSession, ensure_clinic_access, require_roles
from app.core.errors import AppError, not_found
from app.models import Appointment, Clinic, Notification, Patient, User
from app.schemas import CamelModel
from app.services import audit, ratelimit
from app.services.availability import clinic_tz
from app.services.messaging import _front_desk
from app.services.scheduling import as_utc
from app.services.whatsapp import normalise_phone

router = APIRouter(tags=["check-in"])
Admins = Depends(require_roles("super_admin", "admin"))
EARLY = timedelta(hours=2)  # how early before the appointment someone can check in


class LookupIn(CamelModel):
    t: str = Field(min_length=10, max_length=100)
    phone: str = Field(min_length=8, max_length=20)


class ConfirmIn(LookupIn):
    appointment_id: str


def _mask(first: str, last: str) -> str:
    first = (first or "").strip()
    shown = first[:1] + "•" * max(len(first) - 2, 1) + first[-1:] if len(first) > 2 else first[:1] + "•"
    return f"{shown} {last.strip()[:1]}." if last and last.strip() else shown


def _clinic(db, clinic_id: str, token: str) -> Clinic:
    clinic = db.get(Clinic, clinic_id)
    if not clinic or clinic.status != "active" or not clinic.checkin_token or not secrets.compare_digest(clinic.checkin_token, token):
        raise AppError(404, "This check-in code isn't valid. Please check in at the front desk.", "CHECKIN_INVALID")
    return clinic


def _todays(db, clinic: Clinic, phone: str) -> list[tuple[Appointment, Patient, User | None]]:
    digits = normalise_phone(phone)
    if not digits:
        raise AppError(400, "Enter your 10-digit mobile number", "INVALID_PHONE", {"phone": "Invalid number"})
    tz = clinic_tz(clinic)
    now = datetime.now(timezone.utc)
    day = now.astimezone(tz).date()
    start = datetime.combine(day, time.min, tzinfo=tz).astimezone(timezone.utc)
    end = start + timedelta(days=1)
    rows = db.execute(
        select(Appointment, Patient).join(Patient, Patient.id == Appointment.patient_id)
        .where(Appointment.clinic_id == clinic.id, Appointment.start_time >= start, Appointment.start_time < end,
               Appointment.status.in_(("scheduled", "confirmed")))
        .order_by(Appointment.start_time)
    ).all()
    out = []
    for a, p in rows:
        if normalise_phone(p.phone) != digits:
            continue
        if as_utc(a.start_time) - EARLY > now or as_utc(a.end_time) < now:
            continue
        out.append((a, p, db.get(User, a.dentist_id)))
    return out


@router.get("/public/checkin/{clinic_id}")
def checkin_page(clinic_id: str, t: str, request: Request, db: DbSession):
    ratelimit.check(request, "checkin-view", 60, 600)
    clinic = _clinic(db, clinic_id, t)
    return {"clinicName": clinic.name, "clinicPhone": clinic.phone}


@router.post("/public/checkin/{clinic_id}/lookup")
def lookup(clinic_id: str, body: LookupIn, request: Request, db: DbSession):
    """Today's appointments for this mobile number. Only masked first names and times are shown."""
    ratelimit.check(request, "checkin-lookup", 15, 600)
    clinic = _clinic(db, clinic_id, body.t)
    tz = clinic_tz(clinic)
    return [
        {"appointmentId": a.id, "name": _mask(p.first_name, p.last_name),
         "time": as_utc(a.start_time).astimezone(tz).strftime("%I:%M %p").lstrip("0"),
         "dentist": f"Dr. {d.last_name or d.first_name}" if d else None, "procedure": a.procedure_type,
         "alreadyArrived": a.arrived_at is not None}
        for a, p, d in _todays(db, clinic, body.phone)
    ]


@router.post("/public/checkin/{clinic_id}/confirm")
def confirm(clinic_id: str, body: ConfirmIn, request: Request, db: DbSession):
    ratelimit.check(request, "checkin-confirm", 15, 600)
    clinic = _clinic(db, clinic_id, body.t)
    match = next(((a, p, d) for a, p, d in _todays(db, clinic, body.phone) if a.id == body.appointment_id), None)
    if not match:
        raise AppError(404, "We couldn't find that appointment for this number today. Please see the front desk.", "NOT_FOUND")
    appt, patient, dentist = match
    first_time = appt.arrived_at is None
    if first_time:
        appt.arrived_at = datetime.now(timezone.utc)
        tz = clinic_tz(clinic)
        when = as_utc(appt.start_time).astimezone(tz).strftime("%I:%M %p").lstrip("0")
        msg = f"{patient.first_name} {patient.last_name} has arrived for {when} ({appt.procedure_type})."
        if dentist:
            db.add(Notification(user_id=dentist.id, title="Patient arrived", message=msg))
        for u in _front_desk(db, clinic.id):
            db.add(Notification(user_id=u.id, title="Patient checked in", message=msg))
        audit.record(db, None, "self_check_in", "appointment", appt.id, after={"via": "qr"})
    # Position in the queue: others for the same dentist who arrived earlier and aren't in the chair yet.
    ahead = sum(1 for a in db.scalars(select(Appointment).where(
        Appointment.dentist_id == appt.dentist_id, Appointment.clinic_id == clinic.id,
        Appointment.status.in_(("scheduled", "confirmed")), Appointment.arrived_at.is_not(None),
        Appointment.id != appt.id)) if as_utc(a.arrived_at) < as_utc(appt.arrived_at))
    db.commit()
    return {"status": "arrived", "firstName": patient.first_name, "ahead": ahead,
            "dentist": f"Dr. {dentist.last_name or dentist.first_name}" if dentist else None, "already": not first_time}


# ---------------------------------------------------------------------------
# Staff: the QR link and marking arrival
# ---------------------------------------------------------------------------

def _link(clinic: Clinic) -> str:
    return f"{get_settings().public_app_url.rstrip('/')}/checkin/{clinic.id}?t={clinic.checkin_token}"


@router.get("/clinics/{clinic_id}/checkin-link")
def get_link(clinic_id: str, db: DbSession, user: User = Depends(require_roles("super_admin", "admin", "receptionist"))):
    ensure_clinic_access(user, clinic_id)
    clinic = db.get(Clinic, clinic_id)
    if not clinic:
        raise not_found("Clinic")
    if not clinic.checkin_token:
        clinic.checkin_token = secrets.token_urlsafe(18)
        db.commit()
    return {"url": _link(clinic), "clinicName": clinic.name}


@router.post("/clinics/{clinic_id}/checkin-link/regenerate")
def regenerate(clinic_id: str, db: DbSession, user: User = Admins):
    """Retire the old QR code (e.g. a poster was photographed and shared) and make a new one."""
    ensure_clinic_access(user, clinic_id)
    clinic = db.get(Clinic, clinic_id)
    if not clinic:
        raise not_found("Clinic")
    clinic.checkin_token = secrets.token_urlsafe(18)
    audit.record(db, user, "regenerate_checkin", "clinic", clinic.id)
    db.commit()
    return {"url": _link(clinic), "clinicName": clinic.name}


@router.post("/appointments/{appointment_id}/arrived")
def mark_arrived(appointment_id: str, db: DbSession, user: User = Depends(require_roles("super_admin", "admin", "receptionist", "dentist"))):
    """Front desk marks a walk-up arrival (patient waiting, not yet in the chair)."""
    appt = db.get(Appointment, appointment_id)
    if not appt:
        raise not_found("Appointment")
    ensure_clinic_access(user, appt.clinic_id)
    if appt.status not in ("scheduled", "confirmed"):
        raise AppError(400, f"This appointment is {appt.status.replace('_', ' ')}", "INVALID_STATUS")
    if not appt.arrived_at:
        appt.arrived_at = datetime.now(timezone.utc)
        audit.record(db, user, "arrived", "appointment", appt.id)
    db.commit()
    return {"id": appt.id, "arrivedAt": appt.arrived_at}

