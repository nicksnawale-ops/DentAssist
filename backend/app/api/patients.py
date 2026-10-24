import re

from fastapi import APIRouter, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, DbSession, StaffUser, accessible_clinic_ids, ensure_clinic_access
from app.core.errors import bad_request, conflict, forbidden, not_found
from app.models import Patient, User, utcnow
from app.schemas import DuplicateCheckOut, PatientCreate, PatientOut, PatientUpdate, column_values
from app.services import audit
from app.services.serializers import next_appointments_by_patient, patient_out

router = APIRouter(prefix="/patients", tags=["patients"])


def normalise_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    return digits[-10:]  # compare on the last 10 digits so "+91 98765 11111" == "9876511111"


def _scoped(query, user: User):
    allowed = accessible_clinic_ids(user)
    if allowed is not None:
        query = query.where(Patient.clinic_id.in_(allowed))
    return query


def portal_patient_ids(db: Session, user: User) -> set[str]:
    """Patients a portal login may act for: themselves, plus their family if they're its account holder."""
    if user.role != "patient" or not user.patient_id:
        return set()
    me = db.get(Patient, user.patient_id)
    ids = {user.patient_id}
    if me and me.family_id:
        from app.models import Family

        fam = db.get(Family, me.family_id)
        if fam and fam.head_patient_id == me.id:
            ids |= set(db.scalars(select(Patient.id).where(Patient.family_id == fam.id)))
    return ids


def get_patient_for(db: Session, user: User, patient_id: str) -> Patient:
    patient = db.get(Patient, patient_id)
    if not patient:
        raise not_found("Patient")
    if user.role == "patient":
        if patient.id not in portal_patient_ids(db, user):
            raise not_found("Patient")
    else:
        allowed = accessible_clinic_ids(user)
        if allowed is not None and patient.clinic_id not in allowed:
            raise not_found("Patient")
    return patient


def _find_duplicates(db: Session, user: User, phone: str | None, first: str | None, last: str | None,
                     exclude_id: str | None = None) -> list[Patient]:
    candidates = db.scalars(_scoped(select(Patient), user)).all()
    key = normalise_phone(phone) if phone else ""
    matches = []
    for p in candidates:
        if p.id == exclude_id:
            continue
        same_phone = bool(key) and normalise_phone(p.phone) == key
        same_name = bool(first and last) and p.first_name.lower() == first.lower() and p.last_name.lower() == last.lower()
        if same_phone or same_name:
            matches.append(p)
    return matches


@router.get("", response_model=list[PatientOut])
def list_patients(
    user: StaffUser,
    db: DbSession,
    response: Response,
    search: str | None = Query(default=None, max_length=100),
    clinic_id: str | None = Query(default=None, alias="clinicId"),
    tag: str | None = None,
    limit: int = Query(default=500, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
):
    query = _scoped(select(Patient), user)
    if clinic_id and clinic_id != "all":
        ensure_clinic_access(user, clinic_id)
        query = query.where(Patient.clinic_id == clinic_id)
    if search:
        term = f"%{search.strip().lower()}%"
        full_name = func.lower(Patient.first_name + " " + Patient.last_name)
        query = query.where(or_(full_name.like(term), func.lower(Patient.email).like(term), Patient.phone.like(f"%{search.strip()}%")))
    patients = db.scalars(query.order_by(Patient.first_name, Patient.last_name)).all()
    if tag:
        patients = [p for p in patients if tag in (p.tags or [])]
    response.headers["X-Total-Count"] = str(len(patients))
    page = patients[offset: offset + limit]
    upcoming = next_appointments_by_patient(db, [p.id for p in page])
    return [patient_out(p, upcoming.get(p.id)) for p in page]


@router.get("/check-duplicate", response_model=DuplicateCheckOut)
def check_duplicate(
    user: StaffUser,
    db: DbSession,
    phone: str | None = None,
    first_name: str | None = Query(default=None, alias="firstName"),
    last_name: str | None = Query(default=None, alias="lastName"),
    exclude_id: str | None = Query(default=None, alias="excludeId"),
):
    matches = _find_duplicates(db, user, phone, first_name, last_name, exclude_id)
    return DuplicateCheckOut(is_duplicate=bool(matches), matches=[patient_out(p) for p in matches])


@router.post("", response_model=PatientOut, status_code=201)
def create_patient(
    body: PatientCreate,
    user: StaffUser,
    db: DbSession,
    allow_duplicate: bool = Query(default=False, alias="allowDuplicate"),
):
    clinic_id = body.clinic_id or user.clinic_id
    if not clinic_id:
        raise bad_request("Select the clinic this patient belongs to", "CLINIC_REQUIRED")
    ensure_clinic_access(user, clinic_id)
    if not allow_duplicate and _find_duplicates(db, user, body.phone, None, None):
        raise conflict("A patient with this phone number already exists", "DUPLICATE_PATIENT")

    patient = Patient(**column_values(body, exclude={"clinic_id"}), clinic_id=clinic_id)
    db.add(patient)
    db.flush()
    audit.record(db, user, "create", "patient", patient.id, after=body)
    db.commit()
    return patient_out(patient)


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(patient_id: str, user: StaffUser, db: DbSession):
    patient = get_patient_for(db, user, patient_id)
    return patient_out(patient, next_appointments_by_patient(db, [patient.id]).get(patient.id))


@router.patch("/{patient_id}", response_model=PatientOut)
def update_patient(patient_id: str, body: PatientUpdate, user: StaffUser, db: DbSession,
                   clear_edit_request: bool = Query(default=False, alias="clearEditRequest")):
    patient = get_patient_for(db, user, patient_id)
    data = column_values(body)
    if "clinic_id" in data:
        if data["clinic_id"] is None:
            data.pop("clinic_id")
        else:
            ensure_clinic_access(user, data["clinic_id"])
    before = audit.snapshot(patient)
    for key, value in data.items():
        setattr(patient, key, value)
    if clear_edit_request:
        patient.edit_request = None
    audit.record(db, user, "update", "patient", patient.id, before=before, after=patient)
    db.commit()
    return patient_out(patient, next_appointments_by_patient(db, [patient.id]).get(patient.id))


@router.patch("/{patient_id}/request-edit", response_model=PatientOut)
def request_edit(patient_id: str, body: PatientUpdate, user: CurrentUser, db: DbSession):
    """A patient proposes profile changes; staff review and apply them via PATCH /patients/{id}."""
    if user.role != "patient":
        raise forbidden("Only patients can submit edit requests")
    patient = get_patient_for(db, user, patient_id)
    patient.edit_request = {
        "changes": body.model_dump(mode="json", by_alias=True, exclude_unset=True),
        "submittedAt": utcnow().isoformat(),
    }
    audit.record(db, user, "request_edit", "patient", patient.id, after=patient.edit_request)
    db.commit()
    return patient_out(patient)
