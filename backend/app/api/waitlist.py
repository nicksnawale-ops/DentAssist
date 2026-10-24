from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.patients import get_patient_for
from app.core.deps import DbSession, StaffUser, accessible_clinic_ids, ensure_clinic_access
from app.core.errors import not_found
from app.models import User, WaitlistEntry
from app.schemas import WaitlistCreate, WaitlistOut, column_values
from app.services import audit

router = APIRouter(prefix="/waitlist", tags=["waitlist"])


@router.get("", response_model=list[WaitlistOut])
def list_waitlist(user: StaffUser, db: DbSession, clinic_id: str | None = Query(default=None, alias="clinicId"),
                  status: str | None = "waiting"):
    query = select(WaitlistEntry).order_by(WaitlistEntry.created_at)
    allowed = accessible_clinic_ids(user)
    if allowed is not None:
        query = query.where(WaitlistEntry.clinic_id.in_(allowed))
    if clinic_id and clinic_id != "all":
        query = query.where(WaitlistEntry.clinic_id == clinic_id)
    if status:
        query = query.where(WaitlistEntry.status == status)
    return db.scalars(query).all()


@router.post("", response_model=WaitlistOut, status_code=201)
def add_to_waitlist(body: WaitlistCreate, user: StaffUser, db: DbSession):
    ensure_clinic_access(user, body.clinic_id)
    get_patient_for(db, user, body.patient_id)
    if body.preferred_dentist_id:
        dentist = db.get(User, body.preferred_dentist_id)
        if not dentist or dentist.role not in ("dentist", "admin"):
            raise not_found("Dentist")
    entry = WaitlistEntry(**column_values(body))
    db.add(entry)
    db.flush()
    audit.record(db, user, "create", "waitlist", entry.id, after=body)
    db.commit()
    return entry


@router.patch("/{entry_id}", response_model=WaitlistOut)
def update_waitlist_status(entry_id: str, user: StaffUser, db: DbSession,
                           status: Literal["waiting", "scheduled", "cancelled"]):
    entry = db.get(WaitlistEntry, entry_id)
    if not entry:
        raise not_found("Waitlist entry")
    ensure_clinic_access(user, entry.clinic_id)
    entry.status = status
    db.commit()
    return entry
