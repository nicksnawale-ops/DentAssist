from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.deps import DbSession, StaffUser, accessible_clinic_ids, ensure_clinic_access, require_roles
from app.core.errors import conflict, not_found
from app.models import Clinic, Patient, StaffProfile, User
from app.schemas import ClinicCreate, ClinicOut, ClinicUpdate, column_values
from app.services import audit

router = APIRouter(prefix="/clinics", tags=["clinics"])

SuperAdmin = Depends(require_roles("super_admin"))
_REQUIRED = {"name", "status", "timezone"}  # NOT NULL columns: ignore explicit nulls


def _staff_counts(db) -> Counter:
    counts: Counter = Counter()
    for clinic_ids, status in db.execute(select(StaffProfile.clinic_ids, StaffProfile.status)).all():
        if status == "active":
            counts.update(set(clinic_ids or []))
    return counts


def _patient_counts(db) -> dict[str, int]:
    rows = db.execute(select(Patient.clinic_id, func.count()).group_by(Patient.clinic_id)).all()
    return {cid: n for cid, n in rows if cid}


def _out(clinic: Clinic, staff: Counter, patients: dict[str, int]) -> ClinicOut:
    out = ClinicOut.model_validate(clinic)
    out.active_staff_count = staff.get(clinic.id, 0)
    out.active_patients_count = patients.get(clinic.id, 0)
    # monthly_revenue stays 0 until the billing module is moved to the backend.
    return out


def _get(db, clinic_id: str) -> Clinic:
    clinic = db.get(Clinic, clinic_id)
    if not clinic:
        raise not_found("Clinic")
    return clinic


@router.get("", response_model=list[ClinicOut])
def list_clinics(user: StaffUser, db: DbSession):
    query = select(Clinic).order_by(Clinic.created_at)
    allowed = accessible_clinic_ids(user)
    if allowed is not None:
        query = query.where(Clinic.id.in_(allowed))
    staff, patients = _staff_counts(db), _patient_counts(db)
    return [_out(c, staff, patients) for c in db.scalars(query)]


@router.post("", response_model=ClinicOut, status_code=201)
def create_clinic(body: ClinicCreate, db: DbSession, user: User = SuperAdmin):
    clinic = Clinic(**{k: v for k, v in column_values(body).items() if v is not None})
    db.add(clinic)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise conflict("A clinic with this email already exists", "CLINIC_EMAIL_EXISTS")
    audit.record(db, user, "create", "clinic", clinic.id, after=body)
    db.commit()
    return _out(clinic, Counter(), {})


@router.get("/{clinic_id}", response_model=ClinicOut)
def get_clinic(clinic_id: str, user: StaffUser, db: DbSession):
    clinic = _get(db, clinic_id)
    ensure_clinic_access(user, clinic.id)
    return _out(clinic, _staff_counts(db), _patient_counts(db))


@router.patch("/{clinic_id}", response_model=ClinicOut)
def update_clinic(clinic_id: str, body: ClinicUpdate, db: DbSession, user: User = SuperAdmin):
    clinic = _get(db, clinic_id)
    before = audit.snapshot(clinic)
    for key, value in column_values(body).items():
        if value is None and key in _REQUIRED:
            continue
        setattr(clinic, key, value)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise conflict("A clinic with this email already exists", "CLINIC_EMAIL_EXISTS")
    audit.record(db, user, "update", "clinic", clinic.id, before=before, after=clinic)
    db.commit()
    return _out(clinic, _staff_counts(db), _patient_counts(db))


@router.delete("/{clinic_id}", response_model=ClinicOut)
def archive_clinic(clinic_id: str, db: DbSession, user: User = SuperAdmin):
    """Archive (soft-delete): clinics keep their patients and history."""
    clinic = _get(db, clinic_id)
    clinic.status = "inactive"
    audit.record(db, user, "archive", "clinic", clinic.id)
    db.commit()
    return _out(clinic, _staff_counts(db), _patient_counts(db))
