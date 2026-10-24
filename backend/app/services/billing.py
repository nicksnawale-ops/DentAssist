"""Billing rules: invoice maths, numbering, payment recording and status.

All money is Decimal rounded to paise (2 dp, half-up). Totals are always
computed here on the server; amounts sent by a client are never trusted.

GST: healthcare services by a clinical establishment are generally exempt
in India, while cosmetic procedures are taxable. So tax is applied only to
lines marked `taxable`, at the invoice's `tax_rate` (default 18%), split into
CGST + SGST (or IGST for inter-state supply). The discount is spread across
lines in proportion to their value before tax is worked out.
"""

import uuid
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import bad_request
from app.models import Installment, Invoice, InvoiceCounter, Patient, Payment, User
from app.services.scheduling import as_utc

PAISE = Decimal("0.01")
ZERO = Decimal("0")
UNPAID_STATUSES = ("Sent", "Partially Paid", "Overdue")
OPEN_STATUSES = ("Sent", "Partially Paid", "Overdue", "Paid")  # count toward balances and revenue


def money(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(PAISE, rounding=ROUND_HALF_UP)


def compute_totals(
    lines: list[dict],
    discount: Any,
    discount_type: str,
    tax_rate: Any,
    inter_state: bool,
) -> dict[str, Any]:
    """Return normalised line items and all invoice totals."""
    clean_lines: list[dict] = []
    for raw in lines:
        name = str(raw.get("procedureName") or "").strip()
        if not name:
            continue
        qty = int(raw.get("quantity") or 1)
        unit = money(raw.get("unitCost"))
        if qty < 1:
            raise bad_request(f"Quantity for '{name}' must be at least 1", "INVALID_LINE")
        if unit < 0:
            raise bad_request(f"Price for '{name}' cannot be negative", "INVALID_LINE")
        clean_lines.append({
            "id": raw.get("id") or uuid.uuid4().hex[:12],
            "procedureId": raw.get("procedureId"),
            "procedureName": name,
            "toothNumber": raw.get("toothNumber") or None,
            "quantity": qty,
            "unitCost": float(unit),
            "total": float(money(unit * qty)),
            "taxable": bool(raw.get("taxable", False)),
        })
    if not clean_lines:
        raise bad_request("Add at least one line item", "NO_LINE_ITEMS")

    subtotal = money(sum(Decimal(str(li["total"])) for li in clean_lines))
    disc = money(discount)
    if disc < 0:
        raise bad_request("Discount cannot be negative", "INVALID_DISCOUNT")
    if discount_type == "percentage":
        if disc > 100:
            raise bad_request("Percentage discount cannot exceed 100", "INVALID_DISCOUNT")
        discount_amount = money(subtotal * disc / 100)
    else:
        discount_amount = min(disc, subtotal)

    rate = money(tax_rate)
    taxable_subtotal = sum((Decimal(str(li["total"])) for li in clean_lines if li["taxable"]), ZERO)
    share = (subtotal - discount_amount) / subtotal if subtotal > 0 else ZERO
    tax = money(taxable_subtotal * share * rate / 100)
    if inter_state:
        breakdown = {"cgst": 0.0, "sgst": 0.0, "igst": float(tax)}
    else:
        cgst = money(tax / 2)
        breakdown = {"cgst": float(cgst), "sgst": float(tax - cgst), "igst": 0.0}

    return {
        "line_items": clean_lines,
        "subtotal": subtotal,
        "discount": disc,
        "discount_type": discount_type,
        "discount_amount": discount_amount,
        "tax_rate": rate,
        "inter_state": inter_state,
        "tax_breakdown": breakdown,
        "total_tax": tax,
        "total": money(subtotal - discount_amount + tax),
    }


def next_invoice_number(db: Session, when: datetime | None = None) -> str:
    """Allocate the next running number for the year, e.g. INV-2026-0042.

    The counter row is locked (SELECT ... FOR UPDATE on PostgreSQL) so two
    receptionists saving at the same moment never get the same number.
    """
    year = (when or datetime.now(timezone.utc)).year
    counter = db.scalars(select(InvoiceCounter).where(InvoiceCounter.year == year).with_for_update()).first()
    if counter is None:
        counter = InvoiceCounter(year=year, last_number=0)
        db.add(counter)
        db.flush()
    counter.last_number += 1
    return f"INV-{year}-{counter.last_number:04d}"


def balance_due(invoice: Invoice) -> Decimal:
    if invoice.status in ("Draft", "Void"):
        return ZERO if invoice.status == "Void" else money(invoice.total) - money(invoice.amount_paid)
    return max(ZERO, money(invoice.total) - money(invoice.amount_paid))


def derive_status(invoice: Invoice, now: datetime | None = None) -> str:
    if invoice.status == "Void":
        return "Void"
    now = now or datetime.now(timezone.utc)
    paid = money(invoice.amount_paid)
    total = money(invoice.total)
    if invoice.status == "Draft" and paid == 0:
        return "Draft"
    if paid >= total:
        return "Paid"
    if as_utc(invoice.due_date) < now:
        return "Overdue"
    return "Partially Paid" if paid > 0 else "Sent"


def allocate_installments(db: Session, invoice: Invoice, now: datetime | None = None) -> None:
    """Mark installments paid in order using the invoice's total amount paid."""
    now = now or datetime.now(timezone.utc)
    remaining = money(invoice.amount_paid)
    rows = db.scalars(
        select(Installment).where(Installment.invoice_id == invoice.id).order_by(Installment.installment_number)
    ).all()
    for inst in rows:
        amount = money(inst.amount)
        if remaining >= amount:
            inst.status = "Paid"
            remaining -= amount
        else:
            remaining = ZERO
            inst.status = "Overdue" if as_utc(inst.due_date) < now and invoice.status != "Void" else "Pending"


def refresh_patient_balance(db: Session, patient_id: str) -> None:
    patient = db.get(Patient, patient_id)
    if not patient:
        return
    total, paid = db.execute(
        select(func.coalesce(func.sum(Invoice.total), 0), func.coalesce(func.sum(Invoice.amount_paid), 0)).where(
            Invoice.patient_id == patient_id, Invoice.status.in_(OPEN_STATUSES)
        )
    ).one()
    patient.outstanding_balance = max(ZERO, money(total) - money(paid))


def refresh_invoice(db: Session, invoice: Invoice) -> None:
    """Recalculate paid amount, status, installments and the patient's balance."""
    db.flush()
    paid = db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.invoice_id == invoice.id))
    invoice.amount_paid = money(paid)
    if invoice.status == "Draft" and invoice.amount_paid > 0:
        invoice.sent_at = invoice.sent_at or datetime.now(timezone.utc)
        invoice.status = "Sent"
    invoice.status = derive_status(invoice)
    allocate_installments(db, invoice)
    db.flush()
    refresh_patient_balance(db, invoice.patient_id)


def refresh_overdue(db: Session, invoices: list[Invoice]) -> None:
    """Statuses move to Overdue with time; fix any that changed since last read."""
    now = datetime.now(timezone.utc)
    changed = False
    for inv in invoices:
        new_status = derive_status(inv, now)
        if new_status != inv.status:
            inv.status = new_status
            allocate_installments(db, inv, now)
            changed = True
    if changed:
        for pid in {i.patient_id for i in invoices}:
            refresh_patient_balance(db, pid)
        db.commit()


def record_payment(
    db: Session,
    invoice: Invoice,
    amount: Any,
    method: str,
    actor: User | None,
    reference: str | None = None,
    notes: str | None = None,
    source: str = "manual",
    gateway_payment_id: str | None = None,
    paid_at: datetime | None = None,
) -> Payment:
    """Add a payment to an invoice. Gateway payments are idempotent on their payment id."""
    if gateway_payment_id:
        existing = db.scalars(select(Payment).where(Payment.gateway_payment_id == gateway_payment_id)).first()
        if existing:
            return existing
    if invoice.status == "Void":
        raise bad_request("This invoice has been voided", "INVOICE_VOID")
    amt = money(amount)
    if amt <= 0:
        raise bad_request("Payment amount must be more than zero", "INVALID_AMOUNT")
    outstanding = money(invoice.total) - money(invoice.amount_paid)
    if amt > outstanding and source == "manual":
        raise bad_request(f"Payment is more than the balance due ({outstanding})", "OVERPAYMENT")
    payment = Payment(
        invoice_id=invoice.id,
        amount=amt,
        method=method,
        reference_number=reference,
        notes=notes,
        source=source,
        gateway_payment_id=gateway_payment_id,
        recorded_by_id=actor.id if actor else None,
        paid_at=as_utc(paid_at) if paid_at else datetime.now(timezone.utc),
    )
    db.add(payment)
    refresh_invoice(db, invoice)
    return payment
