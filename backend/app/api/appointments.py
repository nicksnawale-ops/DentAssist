from datetime import datetime

from fastapi import APIRouter, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.patients import get_patient_for
from app.core.deps import DbSession, StaffUser, accessible_clinic_ids, ensure_clinic_access
from app.core.errors import bad_request, not_found
from app.models import Appointment, User, WaitlistEntry
from app.schemas import AppointmentCreate, AppointmentOut, AppointmentUpdate, CancelRequest, column_values
from app.services import audit
from app.services import messaging as msg
from app.services.scheduling import as_utc, ensure_no_overlap, validate_dentist_and_clinic
from app.services.waitlist import notify_slot_freed

router = APIRouter(prefix="/appointments", tags=["appointments"])


def _get(db: Session, user: User, appointment_id: str) -> Appointment:
    appt = db.get(Appointment, appointment_id)
    if not appt:
        raise not_found("Appointment")
    allowed = accessible_clinic_ids(user)
    if allowed is not None and appt.clinic_id not in allowed:
        raise not_found("Appointment")
    return appt


def append_note(existing: str | None, line: str) -> str:
    return f"{existing}\n{line}" if existing else line


@router.get("", response_model=list[AppointmentOut])
def list_appointments(
    user: StaffUser,
    db: DbSession,
    clinic_id: str | None = Query(default=None, alias="clinicId"),
    dentist_id: str | None = Query(default=None, alias="dentistId"),
    patient_id: str | None = Query(default=None, alias="patientId"),
    status: str | None = None,
    start: datetime | None = Query(default=None, alias="from", description="Only appointments starting at/after this time"),
    end: datetime | None = Query(default=None, alias="to", description="Only appointments starting before this time"),
):
    query = select(Appointment)
    allowed = accessible_clinic_ids(user)
    if allowed is not None:
        query = query.where(Appointment.clinic_id.in_(allowed))
    if clinic_id and clinic_id != "all":
        query = query.where(Appointment.clinic_id == clinic_id)
    if dentist_id:
        query = query.where(Appointment.dentist_id == dentist_id)
    if patient_id:
        query = query.where(Appointment.patient_id == patient_id)
    if status:
        query = query.where(Appointment.status.in_(status.split(",")))
    if start:
        query = query.where(Appointment.start_time >= as_utc(start))
    if end:
        query = query.where(Appointment.start_time < as_utc(end))
    return db.scalars(query.order_by(Appointment.start_time)).all()


@router.post("", response_model=AppointmentOut, status_code=201)
def create_appointment(body: AppointmentCreate, user: StaffUser, db: DbSession):
    ensure_clinic_access(user, body.clinic_id)
    get_patient_for(db, user, body.patient_id)
    validate_dentist_and_clinic(db, body.dentist_id, body.clinic_id)
    if not body.allow_overlap:
        ensure_no_overlap(db, body.dentist_id, body.start_time, body.end_time)

    appt = Appointment(**column_values(body, exclude={"allow_overlap", "waitlist_entry_id", "send_whatsapp"}))
    appt.start_time, appt.end_time = as_utc(body.start_time), as_utc(body.end_time)
    appt.status = body.status or "scheduled"
    db.add(appt)
    if body.waitlist_entry_id:
        entry = db.get(WaitlistEntry, body.waitlist_entry_id)
        if entry and entry.clinic_id == appt.clinic_id and entry.patient_id == appt.patient_id:
            entry.status = "scheduled"
    db.flush()
    audit.record(db, user, "create", "appointment", appt.id, after=AppointmentOut.model_validate(appt))
    if body.send_whatsapp and appt.status in ("scheduled", "confirmed"):
        msg.quietly(msg.appointment_message, db, appt, "booking_confirmation", user)
    db.commit()
    return appt


@router.get("/{appointment_id}", response_model=AppointmentOut)
def get_appointment(appointment_id: str, user: StaffUser, db: DbSession):
    return _get(db, user, appointment_id)


@router.patch("/{appointment_id}", response_model=AppointmentOut)
def update_appointment(appointment_id: str, body: AppointmentUpdate, user: StaffUser, db: DbSession):
    appt = _get(db, user, appointment_id)
    before = AppointmentOut.model_validate(appt)
    data = column_values(body, exclude={"allow_overlap"})

    if "patient_id" in data:
        get_patient_for(db, user, data["patient_id"])
    clinic_id = data.get("clinic_id") or appt.clinic_id
    dentist_id = data.get("dentist_id") or appt.dentist_id
    if "clinic_id" in data:
        ensure_clinic_access(user, clinic_id)
    start = as_utc(data.get("start_time") or appt.start_time)
    end = as_utc(data.get("end_time") or appt.end_time)
    if end <= start:
        raise bad_request("endTime must be after startTime", "INVALID_TIME_RANGE")

    moved = {"clinic_id", "dentist_id", "start_time", "end_time"} & data.keys()
    old_slot = Appointment(patient_id=appt.patient_id, dentist_id=appt.dentist_id, clinic_id=appt.clinic_id,
                           start_time=appt.start_time, end_time=appt.end_time)
    if moved:
        validate_dentist_and_clinic(db, dentist_id, clinic_id)
        if not body.allow_overlap:
            ensure_no_overlap(db, dentist_id, start, end, exclude_id=appt.id)

    for key, value in data.items():
        if value is not None or key == "notes":
            setattr(appt, key, value)
    appt.start_time, appt.end_time = start, end
    if moved and (as_utc(old_slot.start_time) != start or old_slot.dentist_id != appt.dentist_id):
        notify_slot_freed(db, old_slot)
    elif data.get("status") in ("cancelled", "no_show"):
        notify_slot_freed(db, appt)
    audit.record(db, user, "update", "appointment", appt.id, before=before, after=AppointmentOut.model_validate(appt))
    db.commit()
    return appt


def _cancel(db: Session, user: User, appointment_id: str, reason: str | None) -> Appointment:
    appt = _get(db, user, appointment_id)
    if appt.status == "completed":
        raise bad_request("A completed appointment cannot be cancelled", "APPOINTMENT_COMPLETED")
    appt.status = "cancelled"
    if reason:
        appt.notes = append_note(appt.notes, f"Cancellation Reason: {reason}")
    notify_slot_freed(db, appt)
    audit.record(db, user, "cancel", "appointment", appt.id, after={"reason": reason})
    db.commit()
    return appt


@router.delete("/{appointment_id}", response_model=AppointmentOut)
def cancel_appointment(appointment_id: str, user: StaffUser, db: DbSession, reason: str | None = None):
    return _cancel(db, user, appointment_id, reason)


@router.post("/{appointment_id}/cancel", response_model=AppointmentOut)
def cancel_appointment_with_body(appointment_id: str, body: CancelRequest, user: StaffUser, db: DbSession):
    return _cancel(db, user, appointment_id, body.reason)


@router.post("/{appointment_id}/check-in", response_model=AppointmentOut)
def check_in(appointment_id: str, user: StaffUser, db: DbSession):
    appt = _get(db, user, appointment_id)
    if appt.status not in ("scheduled", "confirmed"):
        raise bad_request(f"Cannot check in an appointment that is {appt.status}", "INVALID_STATUS")
    appt.status = "in_progress"
    audit.record(db, user, "check_in", "appointment", appt.id)
    db.commit()
    return appt
