"""Families: link relatives under one account holder, combined statement and one payment for all."""

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy import select

from app.api.patients import get_patient_for, portal_patient_ids
from app.core.deps import CurrentUser, DbSession, StaffUser, require_roles
from app.core.errors import AppError, bad_request, forbidden, not_found
from app.models import Appointment, Family, Invoice, Patient, User
from app.schemas import CamelModel
from app.services import audit
from app.services import billing as billing_svc
from app.services.scheduling import as_utc
from app.services.whatsapp import normalise_phone

router = APIRouter(tags=["families"])
Billing = Depends(require_roles("super_admin", "admin", "receptionist"))
RELATIONS = "^(Self|Spouse|Child|Parent|Sibling|Grandparent|Other)$"
OPEN = ("Sent", "Partially Paid", "Overdue")


class MemberOut(CamelModel):
    patient_id: str
    name: str
    relation: str | None
    is_head: bool
    phone: str | None
    dob: str | None
    balance: float
    next_appointment: datetime | None


class FamilyOut(CamelModel):
    id: str
    name: str
    head_patient_id: str
    members: list[MemberOut]
    total_balance: float


class LinkIn(CamelModel):
    """Add `patient_id` to the family of `with_patient_id` (creating it, with them as account holder, if needed)."""
    with_patient_id: str
    relation: str = Field(default="Other", pattern=RELATIONS)
    family_name: str | None = Field(default=None, max_length=150)


class HeadIn(CamelModel):
    patient_id: str


class FamilyPaymentIn(CamelModel):
    amount: Decimal = Field(gt=0, le=Decimal("10000000"))
    method: str = Field(pattern="^(Cash|Card|UPI|Bank Transfer|Cheque)$")
    reference_number: str | None = Field(default=None, max_length=120)


def _name(p: Patient) -> str:
    return f"{p.first_name} {p.last_name}".strip()


def _family_out(db, fam: Family) -> FamilyOut:
    members = db.scalars(select(Patient).where(Patient.family_id == fam.id)).all()
    now = datetime.now(timezone.utc)
    nexts = {}
    for a in db.scalars(select(Appointment).where(Appointment.patient_id.in_([m.id for m in members]),
                                                  Appointment.status.in_(("scheduled", "confirmed")),
                                                  Appointment.start_time >= now).order_by(Appointment.start_time)):
        nexts.setdefault(a.patient_id, a.start_time)
    out = [MemberOut(patient_id=m.id, name=_name(m), relation="Self" if m.id == fam.head_patient_id else m.family_relation,
                     is_head=m.id == fam.head_patient_id, phone=m.phone, dob=m.dob, balance=float(m.outstanding_balance or 0),
                     next_appointment=nexts.get(m.id)) for m in members]
    out.sort(key=lambda m: (not m.is_head, m.name))
    return FamilyOut(id=fam.id, name=fam.name, head_patient_id=fam.head_patient_id, members=out,
                     total_balance=float(sum(Decimal(str(m.balance)) for m in out)))


def _family_of(db, user: User, patient_id: str) -> tuple[Patient, Family | None]:
    p = get_patient_for(db, user, patient_id)
    return p, db.get(Family, p.family_id) if p.family_id else None


@router.get("/patients/{patient_id}/family", response_model=FamilyOut | None)
def get_family(patient_id: str, db: DbSession, user: CurrentUser):
    _, fam = _family_of(db, user, patient_id)
    return _family_out(db, fam) if fam else None


@router.get("/patients/{patient_id}/family-suggestions")
def suggestions(patient_id: str, db: DbSession, user: StaffUser):
    """Other patients at the clinic with the same mobile number: often family members booked separately."""
    p = get_patient_for(db, user, patient_id)
    phone = normalise_phone(p.phone)
    if not phone:
        return []
    others = [o for o in db.scalars(select(Patient).where(Patient.id != p.id, Patient.clinic_id == p.clinic_id))
              if normalise_phone(o.phone) == phone and (not p.family_id or o.family_id != p.family_id)]
    return [{"patientId": o.id, "name": _name(o), "dob": o.dob, "inFamily": bool(o.family_id)} for o in others]


@router.post("/patients/{patient_id}/family", response_model=FamilyOut)
def link(patient_id: str, body: LinkIn, db: DbSession, user: StaffUser):
    p = get_patient_for(db, user, patient_id)
    other = get_patient_for(db, user, body.with_patient_id)
    if p.id == other.id:
        raise bad_request("Choose a different patient", "SAME_PATIENT")
    if p.family_id and other.family_id and p.family_id != other.family_id:
        raise AppError(409, f"{_name(p)} is already in another family. Remove them from it first.", "ALREADY_IN_FAMILY")
    fam = db.get(Family, other.family_id) if other.family_id else (db.get(Family, p.family_id) if p.family_id else None)
    if not fam:
        fam = Family(name=(body.family_name or f"{other.last_name or other.first_name} family").strip()[:150],
                     head_patient_id=other.id, clinic_id=other.clinic_id)
        db.add(fam)
        db.flush()
        other.family_id, other.family_relation = fam.id, "Self"
    p.family_id, p.family_relation = fam.id, body.relation
    if other.family_id != fam.id:
        other.family_id, other.family_relation = fam.id, other.family_relation or "Other"
    audit.record(db, user, "family_link", "patient", p.id, after={"family": fam.id, "relation": body.relation})
    db.commit()
    return _family_out(db, fam)


@router.delete("/patients/{patient_id}/family", response_model=FamilyOut | None)
def unlink(patient_id: str, db: DbSession, user: StaffUser):
    p, fam = _family_of(db, user, patient_id)
    if not fam:
        raise bad_request("Not in a family", "NOT_IN_FAMILY")
    p.family_id, p.family_relation = None, None
    db.flush()
    remaining = db.scalars(select(Patient).where(Patient.family_id == fam.id)).all()
    if fam.head_patient_id == p.id and remaining:
        fam.head_patient_id = remaining[0].id  # hand over to the next member; staff can change it
        remaining[0].family_relation = "Self"
    audit.record(db, user, "family_unlink", "patient", p.id, after={"family": fam.id})
    if len(remaining) <= 1:
        for r in remaining:
            r.family_id, r.family_relation = None, None
        db.delete(fam)
        db.commit()
        return None
    db.commit()
    return _family_out(db, fam)


@router.put("/families/{family_id}/head", response_model=FamilyOut)
def set_head(family_id: str, body: HeadIn, db: DbSession, user: StaffUser):
    fam = db.get(Family, family_id)
    if not fam:
        raise not_found("Family")
    p = get_patient_for(db, user, body.patient_id)
    if p.family_id != fam.id:
        raise bad_request("That patient isn't in this family", "NOT_IN_FAMILY")
    old = db.get(Patient, fam.head_patient_id)
    if old and old.id != p.id:
        old.family_relation = "Other"
    fam.head_patient_id, p.family_relation = p.id, "Self"
    audit.record(db, user, "family_head", "family", fam.id, after={"head": p.id})
    db.commit()
    return _family_out(db, fam)


@router.get("/families/{family_id}/statement")
def statement(family_id: str, db: DbSession, user: CurrentUser):
    """Unpaid invoices for everyone in the family, oldest due first."""
    fam = db.get(Family, family_id)
    if not fam:
        raise not_found("Family")
    get_patient_for(db, user, fam.head_patient_id)
    members = {m.id: m for m in db.scalars(select(Patient).where(Patient.family_id == fam.id))}
    if user.role == "patient" and not set(members) <= portal_patient_ids(db, user):
        raise forbidden("Only the family's account holder can see the family statement")
    invoices = db.scalars(select(Invoice).where(Invoice.patient_id.in_(list(members)), Invoice.status.in_(OPEN))
                          .order_by(Invoice.due_date)).all()
    rows = [{"invoiceId": i.id, "invoiceNumber": i.invoice_number, "patientId": i.patient_id,
             "patientName": _name(members[i.patient_id]), "dueDate": as_utc(i.due_date).date().isoformat(),
             "total": float(i.total), "balanceDue": float(billing_svc.balance_due(i)), "status": i.status} for i in invoices]
    return {"familyId": fam.id, "name": fam.name, "invoices": rows,
            "totalDue": float(sum((billing_svc.balance_due(i) for i in invoices), Decimal(0)))}


@router.post("/families/{family_id}/payments")
def pay(family_id: str, body: FamilyPaymentIn, db: DbSession, user: User = Billing):
    """One payment for the family, applied to the oldest unpaid invoices first."""
    fam = db.get(Family, family_id)
    if not fam:
        raise not_found("Family")
    get_patient_for(db, user, fam.head_patient_id)
    member_ids = list(db.scalars(select(Patient.id).where(Patient.family_id == fam.id)))
    invoices = db.scalars(select(Invoice).where(Invoice.patient_id.in_(member_ids), Invoice.status.in_(OPEN))
                          .order_by(Invoice.due_date, Invoice.created_at)).all()
    due = sum((billing_svc.balance_due(i) for i in invoices), Decimal(0))
    amount = billing_svc.money(body.amount)
    if amount > due:
        raise AppError(400, f"The family owes {due}. Enter that or less.", "OVERPAYMENT", {"amount": "More than is due"})
    left, applied = amount, []
    for inv in invoices:
        if left <= 0:
            break
        part = min(left, billing_svc.balance_due(inv))
        if part <= 0:
            continue
        billing_svc.record_payment(db, inv, part, body.method, user, reference=body.reference_number,
                                   notes=f"Family payment ({fam.name})")
        applied.append({"invoiceNumber": inv.invoice_number, "amount": float(part), "status": inv.status})
        left -= part
    audit.record(db, user, "family_payment", "family", fam.id, after={"amount": str(amount), "invoices": len(applied)})
    db.commit()
    return {"applied": applied, "amount": float(amount), "remainingDue": float(due - amount)}
