"""Dentist pay rules, monthly payout statements, and staff attendance."""

from datetime import date, datetime, time, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from pydantic import Field, field_validator
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession, StaffUser, accessible_clinic_ids, ensure_clinic_access, require_roles
from app.core.errors import AppError, bad_request, forbidden, not_found
from app.models import AttendanceRecord, Clinic, CompensationPlan, Payout, User
from app.schemas import CamelModel
from app.services import audit
from app.services import payouts as svc
from app.services.availability import clinic_tz

router = APIRouter(tags=["payouts"])
Admins = Depends(require_roles("super_admin", "admin"))
STAFF_ROLES = ("admin", "dentist", "receptionist")


def _name(u: User | None) -> str:
    return f"{u.first_name} {u.last_name}".strip() if u else ""


def _clinics_of(u: User) -> set[str]:
    ids = set(u.staff_profile.clinic_ids or []) if u.staff_profile else set()
    if u.clinic_id:
        ids.add(u.clinic_id)
    return ids


def _staff(db, actor: User, staff_id: str) -> User:
    u = db.get(User, staff_id)
    if not u or u.role not in STAFF_ROLES:
        raise not_found("Staff member")
    allowed = accessible_clinic_ids(actor)
    if allowed is not None and not (_clinics_of(u) & allowed):
        raise not_found("Staff member")
    return u


# ---------------------------------------------------------------------------
# Pay rules
# ---------------------------------------------------------------------------

class PlanIn(CamelModel):
    clinic_id: str | None = None
    arrangement: str = Field(default="associate", pattern="^(associate|consultant|salaried)$")
    basis: str = Field(default="collections", pattern="^(collections|billing)$")
    percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    lab_share_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    fixed_monthly: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("100000000"))
    minimum_guarantee: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("100000000"))
    tds_percent: Decimal = Field(default=Decimal("10"), ge=0, le=40)
    notes: str | None = Field(default=None, max_length=1000)
    is_active: bool = True


class PlanOut(CamelModel):
    id: str
    staff_id: str
    clinic_id: str | None
    arrangement: str
    basis: str
    percent: float
    lab_share_percent: float
    fixed_monthly: float
    minimum_guarantee: float
    tds_percent: float
    notes: str | None
    is_active: bool


@router.get("/staff/{staff_id}/compensation", response_model=list[PlanOut])
def get_plans(staff_id: str, db: DbSession, user: CurrentUser):
    if user.role not in ("super_admin", "admin") and user.id != staff_id:
        raise forbidden()
    if user.role in ("super_admin", "admin"):
        _staff(db, user, staff_id)
    return db.scalars(select(CompensationPlan).where(CompensationPlan.staff_id == staff_id)).all()


@router.put("/staff/{staff_id}/compensation", response_model=PlanOut)
def put_plan(staff_id: str, body: PlanIn, db: DbSession, user: User = Admins):
    staff = _staff(db, user, staff_id)
    if body.clinic_id:
        ensure_clinic_access(user, body.clinic_id)
    elif user.role != "super_admin":
        raise forbidden("Clinic admins set pay rules for their own clinic")
    if body.arrangement != "salaried" and not body.percent and not body.fixed_monthly:
        raise AppError(400, "Enter a percentage or a fixed monthly amount", "EMPTY_PLAN", {"percent": "Required"})
    plan = db.scalars(select(CompensationPlan).where(CompensationPlan.staff_id == staff.id,
                                                     CompensationPlan.clinic_id.is_(None) if body.clinic_id is None
                                                     else CompensationPlan.clinic_id == body.clinic_id)).first()
    if not plan:
        plan = CompensationPlan(staff_id=staff.id, clinic_id=body.clinic_id)
        db.add(plan)
    for k, v in body.model_dump(exclude={"clinic_id"}).items():
        setattr(plan, k, v)
    db.flush()
    audit.record(db, user, "update", "compensation_plan", plan.id, after=body.model_dump(mode="json"))
    db.commit()
    return plan


# ---------------------------------------------------------------------------
# Payouts
# ---------------------------------------------------------------------------

class AdjustmentIn(CamelModel):
    label: str = Field(min_length=2, max_length=120)
    amount: Decimal = Field(ge=Decimal("-10000000"), le=Decimal("10000000"))

    @field_validator("amount")
    @classmethod
    def _non_zero(cls, v):
        if v == 0:
            raise ValueError("Enter an amount")
        return v


class GenerateIn(CamelModel):
    period: str = Field(pattern=r"^\d{4}-\d{2}$")
    clinic_id: str | None = None


class PaidIn(CamelModel):
    method: str = Field(default="Bank Transfer", max_length=30)
    reference: str | None = Field(default=None, max_length=120)
    paid_on: date | None = None


class PayoutOut(CamelModel):
    id: str
    staff_id: str
    staff_name: str
    clinic_id: str | None
    clinic_name: str | None
    period: str
    status: str
    figures: dict
    adjustments: list[dict]
    net_amount: float
    computed_at: datetime | None
    approved_by_name: str | None
    approved_at: datetime | None
    paid_at: datetime | None
    payment_method: str | None
    payment_reference: str | None
    notes: str | None


def _out(db, p: Payout) -> PayoutOut:
    staff = db.get(User, p.staff_id)
    clinic = db.get(Clinic, p.clinic_id) if p.clinic_id else None
    approver = db.get(User, p.approved_by_id) if p.approved_by_id else None
    return PayoutOut(
        id=p.id, staff_id=p.staff_id, staff_name=f"Dr. {_name(staff)}" if staff and staff.role == "dentist" else _name(staff),
        clinic_id=p.clinic_id, clinic_name=clinic.name if clinic else "All clinics", period=p.period, status=p.status,
        figures=p.figures or {}, adjustments=p.adjustments or [], net_amount=float(p.net_amount or 0),
        computed_at=p.computed_at, approved_by_name=_name(approver) or None, approved_at=p.approved_at, paid_at=p.paid_at,
        payment_method=p.payment_method, payment_reference=p.payment_reference, notes=p.notes,
    )


def _get(db, user: User, payout_id: str) -> Payout:
    p = db.get(Payout, payout_id)
    if not p:
        raise not_found("Payout")
    if user.role in ("super_admin", "admin"):
        allowed = accessible_clinic_ids(user)
        if allowed is not None and (p.clinic_id is None or p.clinic_id not in allowed):
            raise not_found("Payout")
    elif p.staff_id != user.id or p.status == "draft":
        raise not_found("Payout")
    return p


@router.post("/payouts/generate", response_model=list[PayoutOut])
def generate(body: GenerateIn, db: DbSession, user: User = Admins):
    """Create or refresh draft statements for every dentist with pay rules, for one month."""
    svc.parse_period(body.period)
    if body.clinic_id:
        ensure_clinic_access(user, body.clinic_id)
    elif user.role != "super_admin":
        raise bad_request("Choose a clinic", "CLINIC_REQUIRED")
    staff_ids = {p.staff_id for p in db.scalars(select(CompensationPlan).where(CompensationPlan.is_active.is_(True)))}
    out = []
    for sid in staff_ids:
        staff = db.get(User, sid)
        if not staff or not staff.is_active:
            continue
        if body.clinic_id and body.clinic_id not in _clinics_of(staff):
            continue
        if not svc.plan_for(db, sid, body.clinic_id):
            continue
        p = svc.get_or_create(db, staff, body.clinic_id, body.period)
        if p.status == "draft":
            svc.refresh(db, p)
        out.append(p)
    audit.record(db, user, "generate", "payouts", body.period, after={"clinic": body.clinic_id, "count": len(out)})
    db.commit()
    return sorted((_out(db, p) for p in out), key=lambda x: x.staff_name)


@router.get("/payouts", response_model=list[PayoutOut])
def list_payouts(db: DbSession, user: User = Admins, period: str | None = None,
                 clinic_id: str | None = Query(default=None, alias="clinicId")):
    query = select(Payout)
    if period:
        query = query.where(Payout.period == period)
    allowed = accessible_clinic_ids(user)
    if allowed is not None:
        query = query.where(Payout.clinic_id.in_(allowed))
    if clinic_id and clinic_id != "all":
        query = query.where(Payout.clinic_id == clinic_id)
    rows = sorted((_out(db, p) for p in db.scalars(query)), key=lambda x: x.staff_name)
    return sorted(rows, key=lambda x: x.period, reverse=True)  # newest month first, then by name


@router.get("/payouts/mine", response_model=list[PayoutOut])
def my_payouts(db: DbSession, user: StaffUser):
    rows = db.scalars(select(Payout).where(Payout.staff_id == user.id, Payout.status != "draft").order_by(Payout.period.desc())).all()
    return [_out(db, p) for p in rows]


@router.get("/payouts/{payout_id}", response_model=PayoutOut)
def get_payout(payout_id: str, db: DbSession, user: StaffUser):
    return _out(db, _get(db, user, payout_id))


@router.post("/payouts/{payout_id}/recalculate", response_model=PayoutOut)
def recalculate(payout_id: str, db: DbSession, user: User = Admins):
    p = svc.refresh(db, _get(db, user, payout_id))
    db.commit()
    return _out(db, p)


@router.post("/payouts/{payout_id}/adjustments", response_model=PayoutOut)
def add_adjustment(payout_id: str, body: AdjustmentIn, db: DbSession, user: User = Admins):
    p = _get(db, user, payout_id)
    if p.status != "draft":
        raise bad_request("Approved statements can't change. Reopen it first.", "PAYOUT_LOCKED")
    p.adjustments = [*(p.adjustments or []), svc.new_adjustment(body.label, body.amount)]
    svc.refresh(db, p)
    audit.record(db, user, "adjust", "payout", p.id, after={"label": body.label, "amount": str(body.amount)})
    db.commit()
    return _out(db, p)


@router.delete("/payouts/{payout_id}/adjustments/{adjustment_id}", response_model=PayoutOut)
def remove_adjustment(payout_id: str, adjustment_id: str, db: DbSession, user: User = Admins):
    p = _get(db, user, payout_id)
    if p.status != "draft":
        raise bad_request("Approved statements can't change. Reopen it first.", "PAYOUT_LOCKED")
    p.adjustments = [a for a in p.adjustments or [] if a.get("id") != adjustment_id]
    svc.refresh(db, p)
    db.commit()
    return _out(db, p)


@router.post("/payouts/{payout_id}/approve", response_model=PayoutOut)
def approve(payout_id: str, db: DbSession, user: User = Admins):
    p = _get(db, user, payout_id)
    if p.status != "draft":
        raise bad_request("Already approved", "PAYOUT_NOT_DRAFT")
    svc.refresh(db, p)  # freeze the latest figures
    p.status, p.approved_by_id, p.approved_at = "approved", user.id, datetime.now(timezone.utc)
    audit.record(db, user, "approve", "payout", p.id, after={"net": str(p.net_amount)})
    db.commit()
    return _out(db, p)


@router.post("/payouts/{payout_id}/paid", response_model=PayoutOut)
def mark_paid(payout_id: str, body: PaidIn, db: DbSession, user: User = Admins):
    p = _get(db, user, payout_id)
    if p.status != "approved":
        raise bad_request("Approve the statement before marking it paid", "PAYOUT_NOT_APPROVED")
    when = datetime.combine(body.paid_on, time(12), tzinfo=timezone.utc) if body.paid_on else datetime.now(timezone.utc)
    p.status, p.paid_at, p.payment_method, p.payment_reference = "paid", when, body.method, body.reference
    audit.record(db, user, "pay", "payout", p.id, after={"method": body.method, "reference": body.reference})
    db.commit()
    return _out(db, p)


@router.post("/payouts/{payout_id}/reopen", response_model=PayoutOut)
def reopen(payout_id: str, db: DbSession, user: User = Depends(require_roles("super_admin"))):
    p = _get(db, user, payout_id)
    if p.status == "paid":
        raise bad_request("Paid statements can't be reopened. Add an adjustment next month instead.", "PAYOUT_PAID")
    p.status, p.approved_by_id, p.approved_at = "draft", None, None
    audit.record(db, user, "reopen", "payout", p.id)
    db.commit()
    return _out(db, p)


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------

class CheckIn(CamelModel):
    clinic_id: str | None = None


class AttendanceOut(CamelModel):
    id: str | None = None
    staff_id: str
    staff_name: str | None = None
    role: str | None = None
    clinic_id: str | None
    day: date
    status: str
    check_in_at: datetime | None
    check_out_at: datetime | None
    late_minutes: int
    hours: float | None
    source: str
    note: str | None


class AttendanceEdit(CamelModel):
    status: str = Field(pattern="^(present|half_day|leave|absent|holiday)$")
    check_in: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    check_out: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    note: str | None = Field(default=None, max_length=300)
    clinic_id: str | None = None


def _att_out(r: AttendanceRecord, staff: User | None = None) -> AttendanceOut:
    return AttendanceOut(id=r.id, staff_id=r.staff_id, staff_name=_name(staff) if staff else None, role=staff.role if staff else None,
                         clinic_id=r.clinic_id, day=r.day, status=r.status, check_in_at=r.check_in_at, check_out_at=r.check_out_at,
                         late_minutes=r.late_minutes, hours=svc.worked_hours(r), source=r.source, note=r.note)


def _home_clinic(db, user: User, clinic_id: str | None) -> Clinic | None:
    cid = clinic_id or user.clinic_id or next(iter(_clinics_of(user)), None)
    if cid and cid not in _clinics_of(user) and user.role != "super_admin":
        raise forbidden("You don't work at this clinic")
    return db.get(Clinic, cid) if cid else None


@router.get("/attendance/today", response_model=AttendanceOut | None)
def my_today(db: DbSession, user: StaffUser):
    clinic = _home_clinic(db, user, None)
    r = db.scalars(select(AttendanceRecord).where(AttendanceRecord.staff_id == user.id,
                                                  AttendanceRecord.day == svc.today_for(clinic))).first()
    return _att_out(r, user) if r else None


@router.post("/attendance/check-in", response_model=AttendanceOut)
def check_in(body: CheckIn, db: DbSession, user: StaffUser):
    clinic = _home_clinic(db, user, body.clinic_id)
    day = svc.today_for(clinic)
    r = db.scalars(select(AttendanceRecord).where(AttendanceRecord.staff_id == user.id, AttendanceRecord.day == day)).first()
    if r and r.check_in_at:
        raise bad_request("You've already checked in today", "ALREADY_CHECKED_IN")
    now = datetime.now(timezone.utc)
    if not r:
        r = AttendanceRecord(staff_id=user.id, day=day)
        db.add(r)
    r.clinic_id, r.status, r.check_in_at, r.source = clinic.id if clinic else None, "present", now, "self"
    r.late_minutes = svc.late_minutes(user, clinic, now)
    db.commit()
    return _att_out(r, user)


@router.post("/attendance/check-out", response_model=AttendanceOut)
def check_out(db: DbSession, user: StaffUser):
    clinic = _home_clinic(db, user, None)
    r = db.scalars(select(AttendanceRecord).where(AttendanceRecord.staff_id == user.id,
                                                  AttendanceRecord.day == svc.today_for(clinic))).first()
    if not r or not r.check_in_at:
        raise bad_request("Check in first", "NOT_CHECKED_IN")
    if r.check_out_at:
        raise bad_request("You've already checked out today", "ALREADY_CHECKED_OUT")
    r.check_out_at = datetime.now(timezone.utc)
    db.commit()
    return _att_out(r, user)


@router.get("/attendance")
def month_attendance(db: DbSession, user: User = Admins, period: str = Query(pattern=r"^\d{4}-\d{2}$"),
                     clinic_id: str | None = Query(default=None, alias="clinicId")):
    """Every staff member's days in a month, with totals."""
    start, end = svc.parse_period(period)
    allowed = accessible_clinic_ids(user)
    scope = {clinic_id} if clinic_id and clinic_id != "all" else allowed
    if clinic_id and clinic_id != "all":
        ensure_clinic_access(user, clinic_id)
    staff = [u for u in db.scalars(select(User).where(User.role.in_(STAFF_ROLES), User.is_active.is_(True))).unique()
             if scope is None or _clinics_of(u) & scope]
    records = db.scalars(select(AttendanceRecord).where(AttendanceRecord.day >= start, AttendanceRecord.day < end,
                                                        AttendanceRecord.staff_id.in_([u.id for u in staff]))).all()
    by_staff: dict[str, list[AttendanceRecord]] = {}
    for r in records:
        by_staff.setdefault(r.staff_id, []).append(r)
    return [
        {"staffId": u.id, "name": _name(u), "role": u.role,
         "summary": svc.month_summary(by_staff.get(u.id, []), start, end),
         "days": [_att_out(r).model_dump(by_alias=True, mode="json") for r in sorted(by_staff.get(u.id, []), key=lambda r: r.day)]}
        for u in sorted(staff, key=lambda u: (u.role != "dentist", u.first_name))
    ]


@router.get("/attendance/mine")
def my_attendance(db: DbSession, user: StaffUser, period: str = Query(pattern=r"^\d{4}-\d{2}$")):
    start, end = svc.parse_period(period)
    records = db.scalars(select(AttendanceRecord).where(AttendanceRecord.staff_id == user.id, AttendanceRecord.day >= start,
                                                        AttendanceRecord.day < end).order_by(AttendanceRecord.day)).all()
    return {"summary": svc.month_summary(records, start, end),
            "days": [_att_out(r).model_dump(by_alias=True, mode="json") for r in records]}


@router.put("/attendance/{staff_id}/{day}", response_model=AttendanceOut)
def edit_day(staff_id: str, day: date, body: AttendanceEdit, db: DbSession, user: User = Admins):
    """Mark leave, absence or a holiday, or correct times. Always recorded as an admin edit."""
    staff = _staff(db, user, staff_id)
    clinic = _home_clinic(db, staff, body.clinic_id) if body.clinic_id or staff.clinic_id else None
    if clinic:
        ensure_clinic_access(user, clinic.id)
    if day > svc.today_for(clinic) and body.status in ("present", "half_day"):
        raise bad_request("Can't mark someone present on a future day", "FUTURE_DAY")
    tz = clinic_tz(clinic) if clinic else svc.IST

    def at(hhmm: str | None) -> datetime | None:
        if not hhmm:
            return None
        h, m = map(int, hhmm.split(":"))
        if h > 23 or m > 59:
            raise AppError(400, "Use a time like 09:30", "INVALID_TIME")
        return datetime.combine(day, time(h, m), tzinfo=tz).astimezone(timezone.utc)

    cin, cout = at(body.check_in), at(body.check_out)
    if cin and cout and cout <= cin:
        raise AppError(400, "Check-out must be after check-in", "INVALID_TIME")
    r = db.scalars(select(AttendanceRecord).where(AttendanceRecord.staff_id == staff.id, AttendanceRecord.day == day)).first()
    before = _att_out(r).model_dump(mode="json") if r else None
    if not r:
        r = AttendanceRecord(staff_id=staff.id, day=day)
        db.add(r)
    r.clinic_id = clinic.id if clinic else r.clinic_id
    r.status = body.status
    if body.status in ("present", "half_day"):
        r.check_in_at = cin or r.check_in_at
        r.check_out_at = cout or r.check_out_at
        r.late_minutes = svc.late_minutes(staff, clinic, r.check_in_at) if r.check_in_at else 0
    else:
        r.check_in_at = r.check_out_at = None
        r.late_minutes = 0
    r.note, r.source, r.edited_by_id = (body.note or "").strip() or None, "admin", user.id
    db.flush()
    audit.record(db, user, "edit", "attendance", r.id, before=before, after=_att_out(r).model_dump(mode="json"))
    db.commit()
    return _att_out(r, staff)
