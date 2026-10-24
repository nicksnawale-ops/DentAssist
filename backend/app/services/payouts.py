"""Dentist payouts and staff attendance.

Payout for a month (clinic time):
  base        = collections (or billing) credited to the dentist − their share of lab bills
  commission  = base × percent
  gross       = fixed monthly + commission + adjustments, topped up to the minimum guarantee
  TDS         = gross × TDS % (professional fees, section 194J; set 0 for salaried staff)
  net         = gross − TDS
"""

import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import (
    AttendanceRecord, Clinic, CompensationPlan, Invoice, LabOrder, Patient, Payment, Payout, User,
)
from app.services.availability import clinic_tz
from app.services.scheduling import as_utc

IST = ZoneInfo("Asia/Kolkata")
ZERO = Decimal("0")
DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
LATE_GRACE_MINUTES = 10


def money(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def parse_period(period: str) -> tuple[date, date]:
    try:
        start = datetime.strptime(period, "%Y-%m").date().replace(day=1)
    except ValueError:
        raise AppError(400, "Use a month like 2026-10", "INVALID_PERIOD")
    end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    return start, end


def _bounds(start: date, end: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
    return (datetime.combine(start, time.min, tzinfo=tz).astimezone(timezone.utc),
            datetime.combine(end, time.min, tzinfo=tz).astimezone(timezone.utc))


def plan_for(db: Session, staff_id: str, clinic_id: str | None) -> CompensationPlan | None:
    """The clinic-specific plan if there is one, else the all-clinics plan."""
    plans = db.scalars(select(CompensationPlan).where(CompensationPlan.staff_id == staff_id,
                                                      CompensationPlan.is_active.is_(True))).all()
    return next((p for p in plans if p.clinic_id == clinic_id), None) or next((p for p in plans if p.clinic_id is None), None)


def compute(db: Session, staff: User, clinic_id: str | None, period: str, adjustments: list[dict]) -> dict:
    plan = plan_for(db, staff.id, clinic_id)
    if not plan:
        raise AppError(400, f"Set pay rules for Dr. {staff.first_name} {staff.last_name} first", "NO_COMPENSATION_PLAN")
    start, end = parse_period(period)
    tz = clinic_tz(db.get(Clinic, clinic_id)) if clinic_id else IST
    t0, t1 = _bounds(start, end, tz)

    pay_q = (select(Payment, Invoice).join(Invoice, Invoice.id == Payment.invoice_id)
             .where(Invoice.dentist_id == staff.id, Payment.paid_at >= t0, Payment.paid_at < t1))
    inv_q = select(Invoice).where(Invoice.dentist_id == staff.id, Invoice.created_at >= t0, Invoice.created_at < t1,
                                  Invoice.status.in_(("Sent", "Partially Paid", "Paid", "Overdue")))
    lab_q = select(LabOrder).where(LabOrder.dentist_id == staff.id, LabOrder.status != "Cancelled",
                                   LabOrder.delivered_at >= t0, LabOrder.delivered_at < t1)
    if clinic_id:
        pay_q = pay_q.where(Invoice.clinic_id == clinic_id)
        inv_q = inv_q.where(Invoice.clinic_id == clinic_id)
        lab_q = lab_q.where(LabOrder.clinic_id == clinic_id)
    payments = db.execute(pay_q).all()
    invoices = db.scalars(inv_q).all()
    labs = db.scalars(lab_q).all()
    names = {p.id: f"{p.first_name} {p.last_name}".strip() for p in db.scalars(select(Patient).where(
        Patient.id.in_({i.patient_id for _, i in payments} | {i.patient_id for i in invoices} | {o.patient_id for o in labs})))}

    collections = money(sum((p.amount for p, _ in payments), ZERO))
    billing = money(sum((i.total for i in invoices), ZERO))
    lab_costs = money(sum((o.cost or ZERO for o in labs), ZERO))
    lab_deduction = money(lab_costs * plan.lab_share_percent / 100)
    earned = collections if plan.basis == "collections" else billing
    base = max(money(earned - lab_deduction), ZERO)
    commission = money(base * plan.percent / 100)
    adj_total = money(sum((Decimal(str(a.get("amount") or 0)) for a in adjustments), ZERO))
    fixed = money(plan.fixed_monthly)
    gross = money(fixed + commission + adj_total)
    top_up = max(money(plan.minimum_guarantee) - gross, ZERO) if plan.minimum_guarantee else ZERO
    gross = money(gross + top_up)
    tds = money(max(gross, ZERO) * plan.tds_percent / 100)
    net = money(gross - tds)

    return {
        "plan": {"arrangement": plan.arrangement, "basis": plan.basis, "percent": float(plan.percent),
                 "labSharePercent": float(plan.lab_share_percent), "fixedMonthly": float(plan.fixed_monthly),
                 "minimumGuarantee": float(plan.minimum_guarantee), "tdsPercent": float(plan.tds_percent)},
        "collections": float(collections), "billing": float(billing), "labCosts": float(lab_costs),
        "labDeduction": float(lab_deduction), "base": float(base), "commission": float(commission),
        "fixed": float(fixed), "adjustments": float(adj_total), "guaranteeTopUp": float(top_up),
        "gross": float(gross), "tds": float(tds), "net": float(net),
        "payments": [{"date": as_utc(p.paid_at).astimezone(tz).date().isoformat(), "invoiceNumber": i.invoice_number,
                      "patient": names.get(i.patient_id, ""), "method": p.method, "amount": float(p.amount)}
                     for p, i in sorted(payments, key=lambda x: x[0].paid_at)],
        "labCases": [{"orderNumber": o.order_number, "patient": names.get(o.patient_id, ""), "item": o.item_type,
                      "cost": float(o.cost or 0)} for o in labs],
        "invoiceCount": len(invoices),
    }


def refresh(db: Session, payout: Payout) -> Payout:
    if payout.status != "draft":
        raise AppError(400, "Approved statements can't change. Reopen it first.", "PAYOUT_LOCKED")
    staff = db.get(User, payout.staff_id)
    payout.figures = compute(db, staff, payout.clinic_id, payout.period, payout.adjustments or [])
    payout.net_amount = Decimal(str(payout.figures["net"]))
    payout.computed_at = datetime.now(timezone.utc)
    return payout


def get_or_create(db: Session, staff: User, clinic_id: str | None, period: str) -> Payout:
    key = clinic_id or "all"
    p = db.scalars(select(Payout).where(Payout.staff_id == staff.id, Payout.clinic_key == key, Payout.period == period)).first()
    if p:
        return p
    p = Payout(staff_id=staff.id, clinic_id=clinic_id, clinic_key=key, period=period, adjustments=[])
    db.add(p)
    db.flush()
    return p


def new_adjustment(label: str, amount) -> dict:
    return {"id": uuid.uuid4().hex[:10], "label": label.strip(), "amount": float(money(amount))}


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------

def _shift_start(staff: User, clinic: Clinic | None, day: date) -> time | None:
    name = DAY_NAMES[day.weekday()]
    hours = staff.staff_profile.working_hours if staff.staff_profile else None
    for row in hours or []:
        if row.get("day") == name and row.get("isWorking"):
            try:
                h, m = str(row.get("startTime", "")).split(":")[:2]
                return time(int(h), int(m))
            except ValueError:
                return None
    for row in (clinic.operating_hours if clinic else None) or []:
        if row.get("day") == name and row.get("isOpen"):
            try:
                h, m = str(row.get("openTime", "")).split(":")[:2]
                return time(int(h), int(m))
            except ValueError:
                return None
    return None


def late_minutes(staff: User, clinic: Clinic | None, at: datetime) -> int:
    tz = clinic_tz(clinic) if clinic else IST
    local = as_utc(at).astimezone(tz)
    start = _shift_start(staff, clinic, local.date())
    if not start:
        return 0
    diff = int((local - datetime.combine(local.date(), start, tzinfo=tz)).total_seconds() // 60)
    return diff if diff > LATE_GRACE_MINUTES else 0


def today_for(clinic: Clinic | None) -> date:
    return datetime.now(clinic_tz(clinic) if clinic else IST).date()


def worked_hours(r: AttendanceRecord) -> float | None:
    if r.check_in_at and r.check_out_at:
        return round((as_utc(r.check_out_at) - as_utc(r.check_in_at)).total_seconds() / 3600, 2)
    return None


def month_summary(records: list[AttendanceRecord], start: date, end: date) -> dict:
    s = {"present": 0, "halfDay": 0, "leave": 0, "absent": 0, "holiday": 0, "lateDays": 0, "hours": 0.0}
    for r in records:
        if not (start <= r.day < end):
            continue
        key = {"present": "present", "half_day": "halfDay", "leave": "leave", "absent": "absent", "holiday": "holiday"}[r.status]
        s[key] += 1
        if r.late_minutes:
            s["lateDays"] += 1
        s["hours"] += worked_hours(r) or 0
    s["hours"] = round(s["hours"], 1)
    return s
