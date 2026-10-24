"""Smart scheduling: free-slot search, waitlist matches and the public booking page."""

import re
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Query, Request
from pydantic import EmailStr, Field, field_validator
from sqlalchemy import func, select

from app.api.appointments import _get as get_appointment
from app.core.deps import CurrentUser, DbSession, StaffUser, ensure_clinic_access
from app.core.errors import AppError, bad_request, forbidden, not_found
from app.models import Appointment, Clinic, Notification, Patient, User
from app.schemas import CamelModel
from app.services import audit, ratelimit
from app.services.availability import Slot, clinic_tz, dentists_at, free_slots, is_free, next_free_slots
from app.services.scheduling import as_utc
from app.services.waitlist import matches_for

router = APIRouter(tags=["scheduling"])

# What patients can book online, and how long each takes.
VISIT_TYPES = [
    {"key": "checkup", "label": "Check-up and cleaning", "minutes": 30},
    {"key": "consultation", "label": "Consultation", "minutes": 15},
    {"key": "toothache", "label": "Toothache or sensitivity", "minutes": 30},
    {"key": "braces", "label": "Braces or aligners consultation", "minutes": 30},
    {"key": "cosmetic", "label": "Whitening or cosmetic consultation", "minutes": 30},
]
VISIT_BY_KEY = {v["key"]: v for v in VISIT_TYPES}
PUBLIC_LEAD = timedelta(hours=2)  # online bookings need this much notice
MAX_ONLINE_UPCOMING = 2


class SlotOut(CamelModel):
    dentist_id: str
    dentist_name: str
    start_time: datetime
    end_time: datetime


def _slots_out(slots: list[Slot]) -> list[SlotOut]:
    return [SlotOut(dentist_id=s.dentist_id, dentist_name=s.dentist_name, start_time=s.start, end_time=s.end) for s in slots]


def _clinic(db, clinic_id: str) -> Clinic:
    clinic = db.get(Clinic, clinic_id)
    if not clinic or clinic.status != "active":
        raise not_found("Clinic")
    return clinic


def _parse_day(value: str) -> date:
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        raise bad_request("date must be YYYY-MM-DD", "INVALID_DATE")


# ---------------------------------------------------------------------------
# Signed-in users (staff and patients)
# ---------------------------------------------------------------------------

@router.get("/availability", response_model=list[SlotOut])
def availability(
    user: CurrentUser,
    db: DbSession,
    clinic_id: str = Query(alias="clinicId"),
    day: str = Query(alias="date"),
    duration: int = Query(default=30, ge=10, le=240),
    dentist_id: str | None = Query(default=None, alias="dentistId"),
):
    clinic = _clinic(db, clinic_id)
    if user.role != "patient":
        ensure_clinic_access(user, clinic.id)
    floor = datetime.now(timezone.utc) + (timedelta(hours=2) if user.role == "patient" else timedelta(0))
    return _slots_out(free_slots(db, clinic, _parse_day(day), duration, dentist_id, floor))


@router.get("/availability/next", response_model=list[SlotOut])
def next_available(
    user: CurrentUser,
    db: DbSession,
    clinic_id: str = Query(alias="clinicId"),
    duration: int = Query(default=30, ge=10, le=240),
    dentist_id: str | None = Query(default=None, alias="dentistId"),
    limit: int = Query(default=6, ge=1, le=20),
):
    """Earliest free times, for 'first available' buttons."""
    clinic = _clinic(db, clinic_id)
    if user.role != "patient":
        ensure_clinic_access(user, clinic.id)
    floor = datetime.now(timezone.utc) + (timedelta(hours=2) if user.role == "patient" else timedelta(minutes=5))
    return _slots_out(next_free_slots(db, clinic, duration, dentist_id, floor, limit))


@router.get("/appointments/{appointment_id}/waitlist-matches")
def waitlist_matches(appointment_id: str, user: StaffUser, db: DbSession):
    """Waitlisted patients who could take this (cancelled or open) slot, oldest request first."""
    appt = get_appointment(db, user, appointment_id)
    return [
        {"entryId": w.id, "patientId": p.id, "patientName": f"{p.first_name} {p.last_name}".strip(), "phone": p.phone,
         "preferredDateRange": w.preferred_date_range, "preferredDentistId": w.preferred_dentist_id,
         "waitingSince": w.created_at}
        for w, p in matches_for(db, appt)
    ]


# ---------------------------------------------------------------------------
# Public booking page (no login)
# ---------------------------------------------------------------------------

class PublicBookingIn(CamelModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=10, max_length=20)
    email: EmailStr | None = None
    visit_type: str
    dentist_id: str | None = None
    start_time: datetime
    notes: str | None = Field(default=None, max_length=500)
    website: str | None = None  # honeypot: real people never fill this hidden field

    @field_validator("email", mode="before")
    @classmethod
    def _blank_email(cls, v):
        return None if v == "" else v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        digits = re.sub(r"\D", "", v)
        if len(digits) < 10:
            raise ValueError("Enter a 10-digit mobile number")
        return v.strip()


def _public_clinic(db, clinic_id: str) -> Clinic:
    clinic = _clinic(db, clinic_id)
    if not clinic.online_booking_enabled:
        raise AppError(403, "This clinic doesn't take online bookings. Please call to book.", "BOOKING_DISABLED")
    return clinic


@router.get("/public/clinics/{clinic_id}")
def public_clinic(clinic_id: str, request: Request, db: DbSession):
    ratelimit.check(request, "public-read", 120, 60)
    clinic = _public_clinic(db, clinic_id)
    return {
        "id": clinic.id,
        "name": clinic.name,
        "address": clinic.address,
        "phone": clinic.phone,
        "timezone": clinic.timezone,
        "operatingHours": clinic.operating_hours,
        "dentists": [
            {"id": d.id, "name": f"Dr. {d.first_name} {d.last_name}".strip(),
             "specializations": (d.staff_profile.specializations if d.staff_profile else []) or []}
            for d in dentists_at(db, clinic)
        ],
        "visitTypes": VISIT_TYPES,
    }


@router.get("/public/clinics/{clinic_id}/availability", response_model=list[SlotOut])
def public_availability(
    clinic_id: str,
    request: Request,
    db: DbSession,
    visit_type: str = Query(alias="visitType"),
    day: str | None = Query(default=None, alias="date"),
    dentist_id: str | None = Query(default=None, alias="dentistId"),
):
    """Free times for a day, or (without a date) the next available times."""
    ratelimit.check(request, "public-read", 120, 60)
    clinic = _public_clinic(db, clinic_id)
    visit = VISIT_BY_KEY.get(visit_type)
    if not visit:
        raise bad_request("Choose a type of visit", "INVALID_VISIT_TYPE")
    floor = datetime.now(timezone.utc) + PUBLIC_LEAD
    if day:
        target = _parse_day(day)
        if target > datetime.now(clinic_tz(clinic)).date() + timedelta(days=60):
            raise bad_request("Online booking is open up to 60 days ahead", "TOO_FAR_AHEAD")
        return _slots_out(free_slots(db, clinic, target, visit["minutes"], dentist_id, floor))
    return _slots_out(next_free_slots(db, clinic, visit["minutes"], dentist_id, floor, limit=9))


@router.post("/public/clinics/{clinic_id}/bookings", status_code=201)
def public_book(clinic_id: str, body: PublicBookingIn, request: Request, db: DbSession):
    ratelimit.check(request, "public-book", 5, 3600)
    if body.website:  # bot filled the honeypot; pretend success, store nothing
        return {"status": "received"}
    clinic = _public_clinic(db, clinic_id)
    visit = VISIT_BY_KEY.get(body.visit_type)
    if not visit:
        raise bad_request("Choose a type of visit", "INVALID_VISIT_TYPE")
    start = as_utc(body.start_time)
    end = start + timedelta(minutes=visit["minutes"])
    if start < datetime.now(timezone.utc) + PUBLIC_LEAD:
        raise bad_request("Online bookings need at least 2 hours' notice. Please call the clinic.", "TOO_LATE")

    # Pick the dentist: the one asked for, or anyone free at that time.
    candidates = [body.dentist_id] if body.dentist_id else [d.id for d in dentists_at(db, clinic)]
    dentist_id = next((d for d in candidates if is_free(db, clinic, d, start, end)), None)
    if not dentist_id:
        raise AppError(409, "Sorry, that time was just taken. Please choose another.", "SLOT_TAKEN")

    # Find the patient by mobile number at this clinic, or register them. Nothing about an
    # existing patient is ever returned, so the form can't be used to look people up.
    digits = re.sub(r"\D", "", body.phone)[-10:]
    patient = next(
        (p for p in db.scalars(select(Patient).where(Patient.clinic_id == clinic.id))
         if re.sub(r"\D", "", p.phone or "")[-10:] == digits),
        None,
    )
    if patient is None:
        first, _, last = body.name.strip().partition(" ")
        patient = Patient(clinic_id=clinic.id, first_name=first, last_name=last.strip(), phone=body.phone,
                          email=body.email, tags=["Online booking"], referral_source="Online booking",
                          communication_prefs={"whatsappOptIn": True, "language": "English"})
        db.add(patient)
        db.flush()
    else:
        upcoming = db.scalar(select(func.count()).select_from(Appointment).where(
            Appointment.patient_id == patient.id, Appointment.start_time >= datetime.now(timezone.utc),
            Appointment.status.in_(["scheduled", "confirmed"]), Appointment.notes.like("%Booked online%")))
        if (upcoming or 0) >= MAX_ONLINE_UPCOMING:
            raise AppError(409, "You already have upcoming online bookings. Please call the clinic to book more.",
                           "TOO_MANY_BOOKINGS")

    note = "Booked online" + (f": {body.notes.strip()}" if body.notes and body.notes.strip() else "")
    appt = Appointment(patient_id=patient.id, dentist_id=dentist_id, clinic_id=clinic.id, start_time=start, end_time=end,
                       status="scheduled", procedure_type=visit["label"], notes=note)
    db.add(appt)
    db.flush()

    dentist = db.get(User, dentist_id)
    when = start.astimezone(clinic_tz(clinic)).strftime("%a %d %b, %I:%M %p")
    for u in db.scalars(select(User).where(User.role.in_(["receptionist", "admin"]), User.is_active.is_(True))).unique():
        if clinic.id in ({u.clinic_id} | set((u.staff_profile.clinic_ids if u.staff_profile else None) or [])):
            db.add(Notification(user_id=u.id, title="New online booking",
                                message=f"{body.name.strip()} booked {visit['label'].lower()} with Dr. {dentist.last_name} on {when}. Please confirm."))
    audit.record(db, None, "online_booking", "appointment", appt.id, after={"clinic": clinic.id, "start": start.isoformat()})
    db.commit()
    return {
        "status": "booked",
        "appointmentId": appt.id,
        "startTime": start,
        "endTime": end,
        "dentistName": f"Dr. {dentist.first_name} {dentist.last_name}".strip(),
        "visitType": visit["label"],
        "clinicName": clinic.name,
        "clinicPhone": clinic.phone,
    }
