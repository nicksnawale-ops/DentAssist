"""Convert ORM rows to API schemas (the places where shapes differ from the tables)."""

from sqlalchemy.orm import Session

from app.models import Patient, User
from app.schemas import PatientOut, UserOut, money


def user_out(user: User) -> UserOut:
    profile = user.staff_profile
    return UserOut(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        clinic_id=user.clinic_id,
        clinic_ids=(profile.clinic_ids if profile else None),
        patient_id=user.patient_id,
        avatar_url=user.avatar_url,
        phone=user.phone,
        created_at=user.created_at,
        status=(profile.status if profile else None),
        date_joined=(profile.date_joined if profile else None),
        specializations=(profile.specializations if profile else None),
        license_number=(profile.license_number if profile else None),
        working_hours=(profile.working_hours if profile else None),
    )


def patient_out(patient: Patient, next_appointment=None) -> PatientOut:
    return PatientOut(
        id=patient.id,
        clinic_id=patient.clinic_id,
        first_name=patient.first_name,
        last_name=patient.last_name,
        phone=patient.phone,
        email=patient.email,
        dob=patient.dob,
        gender=patient.gender,
        address=patient.address,
        communication_prefs=patient.communication_prefs,
        emergency_contact=patient.emergency_contact,
        medical_history=patient.medical_history,
        dental_history=patient.dental_history,
        insurance=patient.insurance,
        referral_source=patient.referral_source,
        tags=patient.tags or [],
        last_visit=patient.last_visit,
        next_appointment=next_appointment,
        outstanding_balance=money(patient.outstanding_balance),
        edit_request=patient.edit_request,
        created_at=patient.created_at,
    )


def next_appointments_by_patient(db: Session, patient_ids: list[str]) -> dict:
    """Earliest upcoming active appointment start time for each patient."""
    from datetime import datetime, timezone

    from sqlalchemy import func, select

    from app.models import Appointment

    if not patient_ids:
        return {}
    rows = db.execute(
        select(Appointment.patient_id, func.min(Appointment.start_time))
        .where(
            Appointment.patient_id.in_(patient_ids),
            Appointment.start_time >= datetime.now(timezone.utc),
            Appointment.status.in_(["scheduled", "confirmed"]),
        )
        .group_by(Appointment.patient_id)
    ).all()
    return {pid: start for pid, start in rows}
