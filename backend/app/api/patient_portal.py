"""Self-service endpoints for logged-in patients. Everything is scoped to the
caller's own patient record; patients never see other patients' data."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.appointments import append_note
from app.api.patients import get_patient_for, portal_patient_ids
from app.core.deps import DbSession, require_roles
from app.core.errors import bad_request, forbidden, not_found
from app.models import Appointment, Clinic, Patient, User
from app.schemas import AppointmentOut, CancelRequest, PortalBookRequest, PortalRescheduleRequest
from app.services import audit
from app.services import messaging as msg
from app.services.scheduling import as_utc, ensure_no_overlap, validate_dentist_and_clinic
from app.services.waitlist import notify_slot_freed
from app.services.availability import is_free
from app.services.serializers import patient_out

router = APIRouter(prefix="/patient-portal", tags=["patient portal"])

PatientUser = Depends(require_roles("patient"))
MIN_NOTICE = timedelta(hours=2)  # patients can't self-book/change appointments starting sooner than this


def _patient(db, user: User) -> Patient:
    if not user.patient_id:
        raise forbidden("This login is not linked to a patient record")
    patient = db.get(Patient, user.patient_id)
    if not patient:
        raise not_found("Patient")
    return patient


def _own_appointment(db, user: User, appointment_id: str) -> Appointment:
    appt = db.get(Appointment, appointment_id)
    if not appt or appt.patient_id not in portal_patient_ids(db, user):
        raise not_found("Appointment")
    return appt


def _check_notice(start: datetime) -> None:
    if as_utc(start) < datetime.now(timezone.utc) + MIN_NOTICE:
        raise bad_request("Online changes need at least 2 hours' notice. Please call the clinic.", "TOO_LATE")


@router.get("/appointments", response_model=list[AppointmentOut])
def my_appointments(db: DbSession, user: User = PatientUser):
    _patient(db, user)
    return db.scalars(
        select(Appointment).where(Appointment.patient_id.in_(portal_patient_ids(db, user))).order_by(Appointment.start_time.desc())
    ).all()


@router.get("/booking-options")
def booking_options(db: DbSession, user: User = PatientUser):
    """Active clinics and the dentists who work at each, for the self-booking form."""
    _patient(db, user)
    clinics = db.scalars(select(Clinic).where(Clinic.status == "active").order_by(Clinic.name)).all()
    dentists = db.scalars(select(User).where(User.role == "dentist", User.is_active.is_(True))).unique().all()
    out = []
    for c in clinics:
        at_clinic = [
            {"id": d.id, "name": f"Dr. {d.first_name} {d.last_name}".strip(),
             "specializations": (d.staff_profile.specializations if d.staff_profile else []) or []}
            for d in dentists
            if (d.clinic_id == c.id or (d.staff_profile and c.id in (d.staff_profile.clinic_ids or [])))
            and (not d.staff_profile or d.staff_profile.status == "active")
        ]
        out.append({"id": c.id, "name": c.name, "address": c.address, "phone": c.phone,
                    "operatingHours": c.operating_hours, "dentists": at_clinic})
    return out


@router.post("/appointments/book", response_model=AppointmentOut, status_code=201)
def book(body: PortalBookRequest, db: DbSession, user: User = PatientUser):
    _patient(db, user)
    for_patient = get_patient_for(db, user, body.patient_id or user.patient_id)
    if body.end_time <= body.start_time:
        raise bad_request("endTime must be after startTime", "INVALID_TIME_RANGE")
    _check_notice(body.start_time)
    _, clinic = validate_dentist_and_clinic(db, body.dentist_id, body.clinic_id)
    ensure_no_overlap(db, body.dentist_id, body.start_time, body.end_time)
    if not is_free(db, clinic, body.dentist_id, body.start_time, body.end_time):
        raise bad_request("That time isn't available. Please pick one of the times shown.", "SLOT_UNAVAILABLE")
    appt = Appointment(
        patient_id=for_patient.id, dentist_id=body.dentist_id, clinic_id=body.clinic_id,
        start_time=as_utc(body.start_time), end_time=as_utc(body.end_time),
        procedure_type=body.procedure_type, notes=body.notes, status="scheduled",
    )
    db.add(appt)
    db.flush()
    audit.record(db, user, "self_book", "appointment", appt.id, after=AppointmentOut.model_validate(appt))
    msg.quietly(msg.appointment_message, db, appt, "booking_confirmation")
    db.commit()
    return appt


@router.post("/appointments/{appointment_id}/reschedule", response_model=AppointmentOut)
def reschedule(appointment_id: str, body: PortalRescheduleRequest, db: DbSession, user: User = PatientUser):
    appt = _own_appointment(db, user, appointment_id)
    if appt.status not in ("scheduled", "confirmed"):
        raise bad_request("Only upcoming appointments can be rescheduled", "INVALID_STATUS")
    if body.end_time <= body.start_time:
        raise bad_request("endTime must be after startTime", "INVALID_TIME_RANGE")
    _check_notice(appt.start_time)
    _check_notice(body.start_time)
    ensure_no_overlap(db, appt.dentist_id, body.start_time, body.end_time, exclude_id=appt.id)
    clinic = db.get(Clinic, appt.clinic_id)
    if not is_free(db, clinic, appt.dentist_id, body.start_time, body.end_time):
        raise bad_request("That time isn't available. Please pick one of the times shown.", "SLOT_UNAVAILABLE")
    before = AppointmentOut.model_validate(appt)
    notify_slot_freed(db, Appointment(patient_id=appt.patient_id, dentist_id=appt.dentist_id,
                                      clinic_id=appt.clinic_id, start_time=appt.start_time, end_time=appt.end_time))
    appt.start_time, appt.end_time = as_utc(body.start_time), as_utc(body.end_time)
    appt.status = "scheduled"  # needs re-confirmation by the clinic
    audit.record(db, user, "self_reschedule", "appointment", appt.id, before=before,
                 after=AppointmentOut.model_validate(appt))
    db.commit()
    return appt


@router.post("/appointments/{appointment_id}/cancel", response_model=AppointmentOut)
def cancel(appointment_id: str, body: CancelRequest, db: DbSession, user: User = PatientUser):
    appt = _own_appointment(db, user, appointment_id)
    if appt.status not in ("scheduled", "confirmed"):
        raise bad_request("Only upcoming appointments can be cancelled", "INVALID_STATUS")
    _check_notice(appt.start_time)
    appt.status = "cancelled"
    appt.notes = append_note(appt.notes, f"Cancelled by patient{': ' + body.reason if body.reason else ''}")
    notify_slot_freed(db, appt)
    audit.record(db, user, "self_cancel", "appointment", appt.id, after={"reason": body.reason})
    db.commit()
    return appt


@router.get("/records")
def my_records(db: DbSession, user: User = PatientUser):
    patient = _patient(db, user)
    visits = db.scalars(
        select(Appointment).where(Appointment.patient_id == patient.id, Appointment.status == "completed")
        .order_by(Appointment.start_time.desc())
    ).all()
    return {
        "profile": patient_out(patient).model_dump(mode="json", by_alias=True),
        "visits": [AppointmentOut.model_validate(v).model_dump(mode="json", by_alias=True) for v in visits],
        # Dental chart, treatment plans and documents join here when those modules move to the backend.
    }
