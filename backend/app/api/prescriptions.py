"""Medicine catalogue and e-prescriptions."""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError

from app.api.patients import get_patient_for
from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, StaffUser, ensure_clinic_access, require_roles
from app.core.errors import AppError, bad_request, forbidden, not_found
from app.models import Clinic, Medicine, Patient, Prescription, User
from app.schemas import CamelModel
from app.services import audit
from app.services import messaging as msg
from app.services import prescriptions as svc

router = APIRouter(tags=["prescriptions"])
Admins = Depends(require_roles("super_admin", "admin"))
Prescribers = Depends(require_roles("dentist"))
FREQUENCY = r"^(\d(\.\d)?-\d(\.\d)?-\d(\.\d)?|SOS|Once|Weekly|Every \d+ hours)$"


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class MedicineIn(CamelModel):
    name: str = Field(min_length=1, max_length=150)
    generic_name: str = Field(default="", max_length=200)
    form: str = Field(default="Tablet", max_length=30)
    strength: str = Field(default="", max_length=50)
    default_dosage: str = Field(default="1 tablet", max_length=50)
    default_frequency: str = Field(default="1-0-1", pattern=FREQUENCY)
    default_duration_days: int = Field(default=5, ge=0, le=365)
    default_timing: str = Field(default="After food", max_length=30)
    default_instructions: str = Field(default="", max_length=300)
    drug_class: str = Field(default="", max_length=40)
    is_active: bool = True


class MedicineOut(MedicineIn):
    id: str


class RxItem(CamelModel):
    medicine_id: str | None = None
    name: str = Field(min_length=1, max_length=150)
    generic_name: str = Field(default="", max_length=200)
    form: str = Field(default="", max_length=30)
    strength: str = Field(default="", max_length=50)
    dosage: str = Field(default="", max_length=50)
    frequency: str = Field(pattern=FREQUENCY)
    duration_days: int = Field(ge=0, le=365)
    timing: str = Field(default="After food", max_length=30)
    instructions: str = Field(default="", max_length=300)


class PrescriptionIn(CamelModel):
    clinic_id: str | None = None
    appointment_id: str | None = None
    diagnosis: str = Field(default="", max_length=500)
    items: list[RxItem] = Field(min_length=1, max_length=20)
    advice: str | None = Field(default=None, max_length=2000)
    follow_up_date: date | None = None
    # Must be true when the check found allergy or condition warnings.
    acknowledge_warnings: bool = False
    send_whatsapp: bool = False

    @field_validator("follow_up_date")
    @classmethod
    def _future(cls, v: date | None) -> date | None:
        if v and v < datetime.now(timezone.utc).date():
            raise ValueError("Follow-up date can't be in the past")
        return v


class CheckIn(CamelModel):
    items: list[RxItem] = Field(min_length=1, max_length=20)


class Warning_(CamelModel):
    type: str
    medicine: str
    message: str


class PersonOut(CamelModel):
    id: str
    name: str
    detail: str | None = None


class PrescriptionOut(CamelModel):
    id: str
    number: str
    patient_id: str
    clinic_id: str
    dentist_id: str
    appointment_id: str | None
    diagnosis: str
    items: list[RxItem]
    advice: str | None
    follow_up_date: date | None
    acknowledged_warnings: list[Warning_]
    status: str
    cancelled_at: datetime | None
    cancel_reason: str | None
    created_at: datetime
    # For printing
    patient: dict
    dentist: dict
    clinic: dict


class CancelIn(CamelModel):
    reason: str = Field(min_length=3, max_length=300)


class SendOut(CamelModel):
    status: str
    detail: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _age(dob: str | None) -> int | None:
    try:
        born = date.fromisoformat(dob or "")
    except ValueError:
        return None
    today = date.today()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def _out(db, rx: Prescription) -> PrescriptionOut:
    patient = db.get(Patient, rx.patient_id)
    dentist = db.get(User, rx.dentist_id)
    clinic = db.get(Clinic, rx.clinic_id)
    profile = dentist.staff_profile if dentist else None
    return PrescriptionOut(
        id=rx.id, number=rx.number, patient_id=rx.patient_id, clinic_id=rx.clinic_id, dentist_id=rx.dentist_id,
        appointment_id=rx.appointment_id, diagnosis=rx.diagnosis, items=[RxItem(**i) for i in rx.items or []],
        advice=rx.advice, follow_up_date=rx.follow_up_date,
        acknowledged_warnings=[Warning_(**w) for w in rx.acknowledged_warnings or []], status=rx.status,
        cancelled_at=rx.cancelled_at, cancel_reason=rx.cancel_reason, created_at=rx.created_at,
        patient={"name": f"{patient.first_name} {patient.last_name}".strip(), "age": _age(patient.dob),
                 "gender": patient.gender, "phone": patient.phone,
                 "allergies": (patient.medical_history or {}).get("allergies") or []} if patient else {},
        dentist={"name": f"Dr. {dentist.first_name} {dentist.last_name}".strip(),
                 "registrationNumber": profile.license_number if profile else None,
                 "specializations": (profile.specializations if profile else None) or []} if dentist else {},
        clinic={"name": clinic.name, "address": clinic.address, "phone": clinic.phone, "email": clinic.email,
                "logoUrl": clinic.logo_url} if clinic else {},
    )


def _get(db, user: User, rx_id: str) -> Prescription:
    rx = db.get(Prescription, rx_id)
    if not rx:
        raise not_found("Prescription")
    get_patient_for(db, user, rx.patient_id)  # access check (patients only see their own)
    if user.role == "patient" and rx.status != "issued":
        raise not_found("Prescription")
    return rx


def _send(db, rx: Prescription, actor: User | None):
    patient = db.get(Patient, rx.patient_id)
    clinic = db.get(Clinic, rx.clinic_id)
    link = f"{get_settings().public_app_url.rstrip('/')}/records?tab=prescriptions"
    params = [msg._first_name(patient), msg._dentist(db, rx.dentist_id), clinic.name, link]
    return msg.send_template(db, patient, "prescription_issued", params, actor=actor, payload={"prescriptionId": rx.id})


# ---------------------------------------------------------------------------
# Medicines
# ---------------------------------------------------------------------------

@router.get("/medicines", response_model=list[MedicineOut])
def list_medicines(db: DbSession, user: StaffUser, q: str | None = None, include_inactive: bool = Query(False, alias="includeInactive")):
    query = select(Medicine).order_by(Medicine.name)
    if not include_inactive:
        query = query.where(Medicine.is_active.is_(True))
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(Medicine.name.ilike(like), Medicine.generic_name.ilike(like)))
    return db.scalars(query.limit(200)).all()


@router.post("/medicines", response_model=MedicineOut, status_code=201)
def create_medicine(body: MedicineIn, db: DbSession, user: User = Depends(require_roles("super_admin", "admin", "dentist"))):
    m = Medicine(**body.model_dump())
    db.add(m)
    db.flush()
    audit.record(db, user, "create", "medicine", m.id, after=body.model_dump())
    db.commit()
    return m


@router.patch("/medicines/{medicine_id}", response_model=MedicineOut)
def update_medicine(medicine_id: str, body: MedicineIn, db: DbSession, user: User = Admins):
    m = db.get(Medicine, medicine_id)
    if not m:
        raise not_found("Medicine")
    for k, v in body.model_dump().items():
        setattr(m, k, v)
    audit.record(db, user, "update", "medicine", m.id, after=body.model_dump())
    db.commit()
    return m


# ---------------------------------------------------------------------------
# Prescriptions
# ---------------------------------------------------------------------------

@router.post("/patients/{patient_id}/prescriptions/check", response_model=list[Warning_])
def check(patient_id: str, body: CheckIn, db: DbSession, user: StaffUser):
    patient = get_patient_for(db, user, patient_id)
    return svc.check_items(db, patient, [i.model_dump(by_alias=True) for i in body.items])


@router.get("/patients/{patient_id}/prescriptions", response_model=list[PrescriptionOut])
def list_for_patient(patient_id: str, db: DbSession, user: CurrentUser):
    get_patient_for(db, user, patient_id)
    query = select(Prescription).where(Prescription.patient_id == patient_id).order_by(Prescription.created_at.desc())
    if user.role == "patient":
        query = query.where(Prescription.status == "issued")
    return [_out(db, rx) for rx in db.scalars(query)]


@router.post("/patients/{patient_id}/prescriptions", response_model=PrescriptionOut, status_code=201)
def create(patient_id: str, body: PrescriptionIn, db: DbSession, user: User = Prescribers):
    patient = get_patient_for(db, user, patient_id)
    clinic_id = body.clinic_id or patient.clinic_id or user.clinic_id
    ensure_clinic_access(user, clinic_id)
    if not clinic_id or not db.get(Clinic, clinic_id):
        raise bad_request("Choose the clinic for this prescription", "CLINIC_REQUIRED")
    items = [i.model_dump(by_alias=True) for i in body.items]
    warnings = svc.check_items(db, patient, items)
    if warnings and not body.acknowledge_warnings:
        raise AppError(409, "Please review the warnings before issuing this prescription", "PRESCRIPTION_WARNINGS",
                       {f"items.{i}": w["message"] for i, w in enumerate(warnings)})

    def build() -> Prescription:
        return Prescription(number=svc.next_number(db), patient_id=patient.id, clinic_id=clinic_id,
                            dentist_id=user.id, appointment_id=body.appointment_id, diagnosis=body.diagnosis.strip(),
                            items=items, advice=(body.advice or "").strip() or None,
                            follow_up_date=body.follow_up_date, acknowledged_warnings=warnings)

    rx = None
    if db.get_bind().dialect.name == "sqlite":  # single writer; savepoints aren't reliable with pysqlite
        rx = build()
        db.add(rx)
        db.flush()
    else:
        for _ in range(3):  # two dentists saving at once could pick the same number
            try:
                with db.begin_nested():
                    rx = build()
                    db.add(rx)
                    db.flush()
                break
            except IntegrityError:
                rx = None
    if rx is None:
        raise AppError(409, "Please try again", "NUMBER_CLASH")
    audit.record(db, user, "create", "prescription", rx.id, after={"number": rx.number, "items": len(items),
                                                                    "warningsAccepted": len(warnings)})
    if body.send_whatsapp:
        msg.quietly(_send, db, rx, user)
    db.commit()
    return _out(db, rx)


@router.get("/prescriptions/{rx_id}", response_model=PrescriptionOut)
def get_one(rx_id: str, db: DbSession, user: CurrentUser):
    return _out(db, _get(db, user, rx_id))


@router.post("/prescriptions/{rx_id}/cancel", response_model=PrescriptionOut)
def cancel(rx_id: str, body: CancelIn, db: DbSession, user: User = Depends(require_roles("dentist", "super_admin", "admin"))):
    rx = _get(db, user, rx_id)
    if rx.status == "cancelled":
        raise bad_request("Already cancelled", "ALREADY_CANCELLED")
    if user.role == "dentist" and rx.dentist_id != user.id:
        raise forbidden("Only the prescribing dentist can cancel this prescription")
    rx.status, rx.cancelled_at, rx.cancel_reason = "cancelled", datetime.now(timezone.utc), body.reason.strip()
    audit.record(db, user, "cancel", "prescription", rx.id, after={"reason": rx.cancel_reason})
    db.commit()
    return _out(db, rx)


@router.post("/prescriptions/{rx_id}/whatsapp", response_model=SendOut)
def send_whatsapp(rx_id: str, db: DbSession, user: StaffUser):
    rx = _get(db, user, rx_id)
    if rx.status != "issued":
        raise bad_request("This prescription was cancelled", "PRESCRIPTION_CANCELLED")
    row = _send(db, rx, user)
    db.commit()
    return SendOut(status=row.status if row else "skipped",
                   detail="Sent on WhatsApp" if row and row.status == "sent" else ((row.error if row else None) or "Not sent"))


@router.get("/patient-portal/prescriptions", response_model=list[PrescriptionOut])
def my_prescriptions(db: DbSession, user: User = Depends(require_roles("patient"))):
    if not user.patient_id:
        return []
    return list_for_patient(user.patient_id, db, user)


@router.get("/prescriptions", response_model=list[PrescriptionOut])
def recent(db: DbSession, user: StaffUser, days: int = 30, clinic_id: str | None = Query(default=None, alias="clinicId")):
    """Recent prescriptions across the clinic (or the dentist's own)."""
    from app.core.deps import accessible_clinic_ids

    since = datetime.now(timezone.utc) - timedelta(days=min(max(days, 1), 365))
    query = select(Prescription).where(Prescription.created_at >= since).order_by(Prescription.created_at.desc())
    allowed = accessible_clinic_ids(user)
    if allowed is not None:
        query = query.where(Prescription.clinic_id.in_(allowed))
    if clinic_id and clinic_id != "all":
        query = query.where(Prescription.clinic_id == clinic_id)
    if user.role == "dentist":
        query = query.where(Prescription.dentist_id == user.id)
    return [_out(db, rx) for rx in db.scalars(query.limit(300))]
