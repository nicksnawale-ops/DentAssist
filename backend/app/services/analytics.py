"""Owner analytics: revenue, chair time, no-shows, treatment acceptance, recalls.

Definitions (kept here so the numbers on screen are explainable):
- Collected: payments received in the period. Billed: invoices issued (not draft/void) in the period.
- Revenue per dentist: by the dentist each invoice is credited to.
- Chair utilisation: booked minutes (any appointment not cancelled or a no-show) divided by the
  dentist's available minutes (clinic hours ∩ their working hours), for days up to today.
- No-show rate: no-shows / (completed + no-shows) for appointments in the period that are over.
- Cancellation rate: cancelled / all appointments starting in the period.
- Plan acceptance: plans proposed in the period (not drafts) that were approved or later.
- Recall success: recalls created in the period that ended in a booking.
"""

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Appointment, Clinic, Invoice, LabOrder, MessageLog, Patient, Payment, Recall, TreatmentPlan, User,
)
from app.services.availability import _clinic_window, _dentist_window
from app.services.scheduling import as_utc

OPEN_INVOICE = ("Sent", "Partially Paid", "Paid", "Overdue")
BOOKED = ("scheduled", "confirmed", "in_progress", "completed")
ACCEPTED = ("Approved", "In Progress", "Completed")


def _minutes(a: time, b: time) -> int:
    return (b.hour * 60 + b.minute) - (a.hour * 60 + a.minute)


def _overlap(w1: tuple[time, time], w2: tuple[time, time]) -> int:
    start, end = max(w1[0], w2[0]), min(w1[1], w2[1])
    return max(_minutes(start, end), 0) if start < end else 0


def available_minutes(clinic: Clinic, dentist: User, start: date, end: date) -> int:
    total = 0
    day = start
    while day < end:
        cw = _clinic_window(clinic, day)
        if cw:
            dw = _dentist_window(dentist, day)
            if dw is True:
                total += _minutes(*cw)
            elif dw:
                total += _overlap(cw, dw)
        day += timedelta(days=1)
    return total


def _rate(n: float, d: float) -> float | None:
    return round(n / d, 4) if d else None


def _buckets(start: date, end: date) -> tuple[str, list[tuple[str, date, date]]]:
    """Month buckets for long ranges, week buckets (Mon start) for short ones."""
    out = []
    if (end - start).days > 62:
        cur = start.replace(day=1)
        while cur < end:
            nxt = (cur.replace(day=28) + timedelta(days=4)).replace(day=1)
            out.append((cur.strftime("%b %Y"), max(cur, start), min(nxt, end)))
            cur = nxt
        return "month", out
    cur = start - timedelta(days=start.weekday())
    while cur < end:
        nxt = cur + timedelta(days=7)
        out.append((max(cur, start).strftime("%d %b"), max(cur, start), min(nxt, end)))
        cur = nxt
    return "week", out


def compute(db: Session, clinic_ids: set[str] | None, start: date, end: date, dentist_id: str | None = None) -> dict:
    """All analytics for [start, end) (dates). clinic_ids None = every clinic."""
    now = datetime.now(timezone.utc)
    s_dt = datetime.combine(start, time.min, tzinfo=timezone.utc)
    e_dt = datetime.combine(end, time.min, tzinfo=timezone.utc)

    def scoped(query, column):
        return query if clinic_ids is None else query.where(column.in_(clinic_ids))

    # --- Money ---
    pay_q = scoped(select(Payment, Invoice).join(Invoice, Invoice.id == Payment.invoice_id)
                   .where(Payment.paid_at >= s_dt, Payment.paid_at < e_dt), Invoice.clinic_id)
    inv_q = scoped(select(Invoice).where(Invoice.created_at >= s_dt, Invoice.created_at < e_dt,
                                         Invoice.status.in_(OPEN_INVOICE)), Invoice.clinic_id)
    if dentist_id:
        pay_q = pay_q.where(Invoice.dentist_id == dentist_id)
        inv_q = inv_q.where(Invoice.dentist_id == dentist_id)
    payments = db.execute(pay_q).all()
    invoices = db.scalars(inv_q).all()
    collected = sum((p.amount for p, _ in payments), Decimal(0))
    billed = sum((i.total for i in invoices), Decimal(0))

    # --- Appointments ---
    appt_q = scoped(select(Appointment).where(Appointment.start_time >= s_dt, Appointment.start_time < e_dt),
                    Appointment.clinic_id)
    if dentist_id:
        appt_q = appt_q.where(Appointment.dentist_id == dentist_id)
    appts = db.scalars(appt_q).all()
    past = [a for a in appts if as_utc(a.end_time) <= now]
    completed = [a for a in past if a.status == "completed"]
    no_shows = [a for a in past if a.status == "no_show"]
    cancelled = [a for a in appts if a.status == "cancelled"]

    # --- Patients ---
    pat_q = scoped(select(Patient).where(Patient.created_at >= s_dt, Patient.created_at < e_dt), Patient.clinic_id)
    new_patients = db.scalars(pat_q).all() if not dentist_id else [
        p for p in db.scalars(pat_q) if any(a.patient_id == p.id for a in appts)]

    # --- Chair time per dentist (days up to today) ---
    util_end = min(end, now.date() + timedelta(days=1))
    clinics = {c.id: c for c in db.scalars(select(Clinic))}
    users = {u.id: u for u in db.scalars(select(User).where(User.role.in_(("dentist", "admin"))))}
    per = defaultdict(lambda: {"collected": Decimal(0), "billed": Decimal(0), "visits": 0, "noShows": 0,
                               "bookedMinutes": 0, "availableMinutes": 0})
    for p, inv in payments:
        per[inv.dentist_id or "unassigned"]["collected"] += p.amount
    for inv in invoices:
        per[inv.dentist_id or "unassigned"]["billed"] += inv.total
    for a in appts:
        row = per[a.dentist_id]
        if a.status in BOOKED and as_utc(a.start_time).date() < util_end:
            row["bookedMinutes"] += int((as_utc(a.end_time) - as_utc(a.start_time)).total_seconds() // 60)
        if a in completed:
            row["visits"] += 1
        if a in no_shows:
            row["noShows"] += 1
    for did, u in users.items():
        if dentist_id and did != dentist_id:
            continue
        home = set(u.staff_profile.clinic_ids or []) if u.staff_profile else set()
        if u.clinic_id:
            home.add(u.clinic_id)
        if u.role == "admin" and did not in per:
            continue
        for cid in home:
            if (clinic_ids is None or cid in clinic_ids) and cid in clinics:
                per[did]["availableMinutes"] += available_minutes(clinics[cid], u, start, util_end) if start < util_end else 0

    by_dentist = []
    for did, r in per.items():
        if not any((r["collected"], r["billed"], r["visits"], r["bookedMinutes"], r["availableMinutes"])):
            continue
        u = users.get(did)
        by_dentist.append({
            "dentistId": None if did == "unassigned" else did,
            "name": f"Dr. {u.first_name} {u.last_name}".strip() if u else "Not credited",
            "collected": float(r["collected"]), "billed": float(r["billed"]), "visits": r["visits"],
            "noShowRate": _rate(r["noShows"], r["visits"] + r["noShows"]),
            "bookedHours": round(r["bookedMinutes"] / 60, 1), "availableHours": round(r["availableMinutes"] / 60, 1),
            "utilisation": _rate(min(r["bookedMinutes"], r["availableMinutes"] or r["bookedMinutes"]), r["availableMinutes"]),
        })
    by_dentist.sort(key=lambda d: -d["collected"])
    booked_total = sum(r["bookedMinutes"] for r in per.values())
    avail_total = sum(r["availableMinutes"] for r in per.values())

    # --- Procedures and payment methods ---
    procs = defaultdict(lambda: {"count": 0, "revenue": 0.0})
    for inv in invoices:
        for li in inv.line_items or []:
            name = li.get("procedureName") or "Other"
            qty = int(li.get("quantity") or 1)
            procs[name]["count"] += qty
            procs[name]["revenue"] += float(li.get("total") or (float(li.get("unitCost") or 0) * qty))
    top_procedures = sorted(({"name": k, **v} for k, v in procs.items()), key=lambda x: -x["revenue"])[:8]
    methods = defaultdict(Decimal)
    for p, _ in payments:
        methods[p.method] += p.amount

    # --- Treatment plans ---
    plan_q = scoped(select(TreatmentPlan).where(TreatmentPlan.created_at >= s_dt, TreatmentPlan.created_at < e_dt,
                                                TreatmentPlan.status != "Draft"), TreatmentPlan.clinic_id)
    if dentist_id:
        plan_q = plan_q.where(TreatmentPlan.created_by_id == dentist_id)
    plans = db.scalars(plan_q).all()
    value = lambda ps: float(sum((sum((i.cost for i in p.items), Decimal(0)) for p in ps), Decimal(0)))  # noqa: E731
    accepted = [p for p in plans if p.status in ACCEPTED]
    done = [p for p in plans if p.status == "Completed"]

    # --- Recalls, reviews, lab ---
    rec_q = scoped(select(Recall).where(Recall.created_at >= s_dt, Recall.created_at < e_dt), Recall.clinic_id)
    recalls = db.scalars(rec_q).all()
    contacted = [r for r in recalls if r.contact_count > 0 or r.status == "booked"]
    rec_booked = [r for r in recalls if r.status == "booked"]
    review_q = select(MessageLog).where(MessageLog.kind == "review_request", MessageLog.created_at >= s_dt,
                                        MessageLog.created_at < e_dt, MessageLog.status.in_(("sent", "delivered", "read")))
    if clinic_ids is not None:
        review_q = review_q.where(MessageLog.appointment_id.in_(select(Appointment.id).where(Appointment.clinic_id.in_(clinic_ids))))
    reviews = len(db.scalars(review_q).all())
    lab_q = scoped(select(LabOrder).where(LabOrder.order_date >= start, LabOrder.order_date < end,
                                          LabOrder.status != "Cancelled"), LabOrder.clinic_id)
    if dentist_id:
        lab_q = lab_q.where(LabOrder.dentist_id == dentist_id)
    labs = db.scalars(lab_q).all()

    # --- Trend ---
    granularity, buckets = _buckets(start, end)
    trend = []
    for label, b0, b1 in buckets:
        t0, t1 = datetime.combine(b0, time.min, tzinfo=timezone.utc), datetime.combine(b1, time.min, tzinfo=timezone.utc)
        in_b = lambda dt: t0 <= as_utc(dt) < t1  # noqa: E731
        b_completed = sum(1 for a in completed if in_b(a.start_time))
        b_noshow = sum(1 for a in no_shows if in_b(a.start_time))
        trend.append({
            "label": label, "start": b0.isoformat(),
            "collected": float(sum((p.amount for p, _ in payments if in_b(p.paid_at)), Decimal(0))),
            "visits": b_completed, "newPatients": sum(1 for p in new_patients if in_b(p.created_at)),
            "noShowRate": _rate(b_noshow, b_completed + b_noshow),
            "cancellationRate": _rate(sum(1 for a in cancelled if in_b(a.start_time)), sum(1 for a in appts if in_b(a.start_time))),
        })

    return {
        "range": {"from": start.isoformat(), "to": (end - timedelta(days=1)).isoformat(), "granularity": granularity},
        "kpis": {
            "collected": float(collected), "billed": float(billed), "visits": len(completed),
            "newPatients": len(new_patients), "revenuePerVisit": float(collected / len(completed)) if completed else None,
            "noShowRate": _rate(len(no_shows), len(completed) + len(no_shows)),
            "cancellationRate": _rate(len(cancelled), len(appts)),
            "chairUtilisation": _rate(min(booked_total, avail_total or booked_total), avail_total),
            "planAcceptanceRate": _rate(len(accepted), len(plans)),
            "recallSuccessRate": _rate(len(rec_booked), len(recalls)),
            "reviewRequests": reviews, "labSpend": float(sum((o.cost or 0 for o in labs), Decimal(0))),
        },
        "trend": trend,
        "byDentist": by_dentist,
        "topProcedures": top_procedures,
        "paymentMethods": [{"method": m, "amount": float(a)} for m, a in sorted(methods.items(), key=lambda x: -x[1])],
        "plans": {"proposed": len(plans), "accepted": len(accepted), "completed": len(done),
                  "proposedValue": value(plans), "acceptedValue": value(accepted)},
        "recalls": {"created": len(recalls), "contacted": len(contacted), "booked": len(rec_booked)},
        "lab": {"cases": len(labs), "remakes": sum(1 for o in labs if o.remake_of_id)},
    }
