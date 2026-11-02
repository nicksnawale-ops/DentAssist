"""Invoices, payments, installments, insurance claims, procedure catalog,
online payments (Razorpay) and billing reports."""

import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.patients import get_patient_for
from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, StaffUser, accessible_clinic_ids, ensure_clinic_access, require_roles
from app.core.errors import AppError, bad_request, forbidden, not_found
from app.models import (
    Clinic,
    Installment,
    InsuranceClaim,
    Invoice,
    Patient,
    Payment,
    PaymentOrder,
    Procedure,
    User,
    utcnow,
)
from app.schemas import (
    ClaimIn,
    ClaimOut,
    ClaimUpdate,
    InstallmentOut,
    InstallmentPlanIn,
    InvoiceCreate,
    InvoiceDetailOut,
    InvoiceOut,
    InvoiceUpdate,
    PaymentConfigOut,
    PaymentIn,
    PaymentOrderOut,
    PaymentOut,
    ProcedureIn,
    ProcedureOut,
    ProcedureUpdate,
    VerifyPaymentIn,
    VoidRequest,
)
from app.services import audit
from app.services import billing as svc
from app.services import razorpay
from app.services import messaging as msg
from app.services.scheduling import as_utc

router = APIRouter(tags=["billing"])

BillingStaff = Depends(require_roles("super_admin", "admin", "receptionist"))
Managers = Depends(require_roles("super_admin", "admin"))


# ---------------------------------------------------------------------------
# Serialisers
# ---------------------------------------------------------------------------

def _invoice_out(inv: Invoice, patient: Patient | None, has_installments: bool = False) -> InvoiceOut:
    return InvoiceOut(
        id=inv.id,
        invoice_number=inv.invoice_number,
        patient_id=inv.patient_id,
        patient_name=f"{patient.first_name} {patient.last_name}".strip() if patient else None,
        patient_phone=patient.phone if patient else None,
        clinic_id=inv.clinic_id,
        treatment_plan_id=inv.treatment_plan_id,
        line_items=inv.line_items or [],
        subtotal=float(inv.subtotal),
        discount=float(inv.discount),
        discount_type=inv.discount_type,
        discount_amount=float(inv.discount_amount),
        tax_rate=float(inv.tax_rate),
        inter_state=inv.inter_state,
        tax_breakdown=inv.tax_breakdown or {},
        total_tax=float(inv.total_tax),
        total=float(inv.total),
        amount_paid=float(inv.amount_paid),
        balance_due=float(svc.balance_due(inv)),
        status=inv.status,
        due_date=inv.due_date,
        notes=inv.notes,
        sent_at=inv.sent_at,
        voided_at=inv.voided_at,
        void_reason=inv.void_reason,
        created_at=inv.created_at,
        has_installments=has_installments,
    )


def _payment_out(p: Payment) -> PaymentOut:
    return PaymentOut(
        id=p.id, invoice_id=p.invoice_id, amount=float(p.amount), method=p.method,
        reference_number=p.reference_number, notes=p.notes, source=p.source,
        recorded_by_staff_id=p.recorded_by_id, paid_at=p.paid_at,
    )


def _claim_out(c: InsuranceClaim, inv: Invoice | None, patient: Patient | None) -> ClaimOut:
    return ClaimOut(
        id=c.id, invoice_id=c.invoice_id, invoice_number=inv.invoice_number if inv else None,
        patient_id=c.patient_id,
        patient_name=f"{patient.first_name} {patient.last_name}".strip() if patient else None,
        provider_name=c.provider_name, policy_number=c.policy_number, claim_amount=float(c.claim_amount),
        approved_amount=float(c.approved_amount) if c.approved_amount is not None else None,
        status=c.status, notes=c.notes, submitted_at=c.submitted_at,
    )


def _detail(db: Session, inv: Invoice) -> InvoiceDetailOut:
    patient = db.get(Patient, inv.patient_id)
    payments = db.scalars(select(Payment).where(Payment.invoice_id == inv.id).order_by(Payment.paid_at)).all()
    installments = db.scalars(
        select(Installment).where(Installment.invoice_id == inv.id).order_by(Installment.installment_number)
    ).all()
    claims = db.scalars(select(InsuranceClaim).where(InsuranceClaim.invoice_id == inv.id)).all()
    base = _invoice_out(inv, patient, bool(installments)).model_dump()
    return InvoiceDetailOut(
        **base,
        payments=[_payment_out(p) for p in payments],
        installments=[InstallmentOut.model_validate(i) for i in installments],
        claims=[_claim_out(c, inv, patient) for c in claims],
    )


def _get_invoice(db: Session, user: User, invoice_id: str) -> Invoice:
    inv = db.get(Invoice, invoice_id)
    if not inv:
        raise not_found("Invoice")
    if user.role == "patient":
        if inv.patient_id != user.patient_id or inv.status == "Draft":
            raise not_found("Invoice")
    else:
        allowed = accessible_clinic_ids(user)
        if allowed is not None and inv.clinic_id not in allowed:
            raise not_found("Invoice")
    return inv


def _with_installment_flags(db: Session, invoices: list[Invoice]) -> set[str]:
    ids = [i.id for i in invoices]
    if not ids:
        return set()
    return set(db.scalars(select(Installment.invoice_id).where(Installment.invoice_id.in_(ids)).distinct()))


# ---------------------------------------------------------------------------
# Procedure catalog
# ---------------------------------------------------------------------------

@router.get("/procedures", response_model=list[ProcedureOut])
def list_procedures(user: StaffUser, db: DbSession, include_inactive: bool = Query(default=False, alias="includeInactive")):
    query = select(Procedure).order_by(Procedure.category, Procedure.name)
    allowed = accessible_clinic_ids(user)
    if allowed is not None:
        query = query.where(or_(Procedure.clinic_id.is_(None), Procedure.clinic_id.in_(allowed)))
    if not include_inactive:
        query = query.where(Procedure.is_active.is_(True))
    return db.scalars(query).all()


@router.post("/procedures", response_model=ProcedureOut, status_code=201)
def create_procedure(body: ProcedureIn, db: DbSession, user: User = Managers):
    if body.clinic_id:
        ensure_clinic_access(user, body.clinic_id)
    elif user.role != "super_admin":
        raise forbidden("Only a super admin can add procedures for all clinics")
    proc = Procedure(**body.model_dump())
    db.add(proc)
    db.flush()
    audit.record(db, user, "create", "procedure", proc.id, after=body)
    db.commit()
    return proc


@router.patch("/procedures/{procedure_id}", response_model=ProcedureOut)
def update_procedure(procedure_id: str, body: ProcedureUpdate, db: DbSession, user: User = Managers):
    proc = db.get(Procedure, procedure_id)
    if not proc:
        raise not_found("Procedure")
    if proc.clinic_id:
        ensure_clinic_access(user, proc.clinic_id)
    elif user.role != "super_admin":
        raise forbidden("Only a super admin can change procedures shared by all clinics")
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(proc, k, v)
    audit.record(db, user, "update", "procedure", proc.id, after=body)
    db.commit()
    return proc


# ---------------------------------------------------------------------------
# Invoices
# ---------------------------------------------------------------------------

@router.get("/invoices", response_model=list[InvoiceOut])
def list_invoices(
    user: StaffUser,
    db: DbSession,
    status: str | None = None,
    patient_id: str | None = Query(default=None, alias="patientId"),
    clinic_id: str | None = Query(default=None, alias="clinicId"),
    search: str | None = Query(default=None, max_length=100),
    start: datetime | None = Query(default=None, alias="from"),
    end: datetime | None = Query(default=None, alias="to"),
    limit: int = Query(default=500, ge=1, le=2000),
):
    query = select(Invoice, Patient).join(Patient, Patient.id == Invoice.patient_id)
    allowed = accessible_clinic_ids(user)
    if allowed is not None:
        query = query.where(Invoice.clinic_id.in_(allowed))
    if clinic_id and clinic_id != "all":
        query = query.where(Invoice.clinic_id == clinic_id)
    if patient_id:
        query = query.where(Invoice.patient_id == patient_id)
    if start:
        query = query.where(Invoice.created_at >= as_utc(start))
    if end:
        query = query.where(Invoice.created_at < as_utc(end))
    if search:
        term = f"%{search.strip().lower()}%"
        query = query.where(or_(
            func.lower(Invoice.invoice_number).like(term),
            func.lower(Patient.first_name + " " + Patient.last_name).like(term),
            Patient.phone.like(f"%{search.strip()}%"),
        ))
    rows = db.execute(query.order_by(Invoice.created_at.desc()).limit(limit)).all()
    svc.refresh_overdue(db, [inv for inv, _ in rows])
    if status:
        wanted = set(status.split(","))
        rows = [(inv, p) for inv, p in rows if inv.status in wanted]
    flags = _with_installment_flags(db, [inv for inv, _ in rows])
    return [_invoice_out(inv, p, inv.id in flags) for inv, p in rows]


@router.post("/invoices", response_model=InvoiceDetailOut, status_code=201)
def create_invoice(body: InvoiceCreate, db: DbSession, user: User = BillingStaff):
    patient = get_patient_for(db, user, body.patient_id)
    clinic_id = body.clinic_id if body.clinic_id and body.clinic_id != "all" else (patient.clinic_id or user.clinic_id)
    if not clinic_id:
        raise bad_request("Choose the clinic this invoice belongs to", "CLINIC_REQUIRED")
    ensure_clinic_access(user, clinic_id)
    if not db.get(Clinic, clinic_id):
        raise not_found("Clinic")

    totals = svc.compute_totals(
        [li.model_dump(by_alias=True) for li in body.line_items],
        body.discount, body.discount_type,
        body.tax_rate if body.tax_rate is not None else get_settings().default_gst_rate,
        body.inter_state,
    )
    inv = Invoice(
        invoice_number=svc.next_invoice_number(db),
        patient_id=patient.id,
        clinic_id=clinic_id,
        treatment_plan_id=body.treatment_plan_id,
        due_date=as_utc(body.due_date),
        notes=body.notes,
        created_by_id=user.id,
        status="Draft",
        **totals,
    )
    if body.send_now:
        inv.status, inv.sent_at = "Sent", utcnow()
    db.add(inv)
    db.flush()
    svc.refresh_invoice(db, inv)
    audit.record(db, user, "create", "invoice", inv.id, after={"invoiceNumber": inv.invoice_number, "total": str(inv.total)})
    db.commit()
    return _detail(db, inv)


@router.get("/invoices/{invoice_id}", response_model=InvoiceDetailOut)
def get_invoice(invoice_id: str, user: CurrentUser, db: DbSession):
    inv = _get_invoice(db, user, invoice_id)
    svc.refresh_overdue(db, [inv])
    return _detail(db, inv)


@router.patch("/invoices/{invoice_id}", response_model=InvoiceDetailOut)
def update_invoice(invoice_id: str, body: InvoiceUpdate, db: DbSession, user: User = BillingStaff):
    inv = _get_invoice(db, user, invoice_id)
    data = body.model_dump(exclude_unset=True)
    money_fields = {"line_items", "discount", "discount_type", "tax_rate", "inter_state"}
    if inv.status != "Draft" and money_fields & data.keys():
        raise bad_request("Only draft invoices can have their amounts changed. Void and re-issue instead.",
                          "INVOICE_LOCKED")
    if inv.status == "Void":
        raise bad_request("This invoice has been voided", "INVOICE_VOID")
    before = {"total": str(inv.total), "dueDate": inv.due_date.isoformat()}
    if money_fields & data.keys():
        totals = svc.compute_totals(
            [li.model_dump(by_alias=True) for li in body.line_items] if body.line_items else inv.line_items,
            data.get("discount", inv.discount),
            data.get("discount_type") or inv.discount_type,
            data.get("tax_rate") if data.get("tax_rate") is not None else inv.tax_rate,
            data.get("inter_state", inv.inter_state),
        )
        for k, v in totals.items():
            setattr(inv, k, v)
    if data.get("due_date"):
        inv.due_date = as_utc(data["due_date"])
    if "notes" in data:
        inv.notes = data["notes"]
    svc.refresh_invoice(db, inv)
    audit.record(db, user, "update", "invoice", inv.id, before=before,
                 after={"total": str(inv.total), "dueDate": inv.due_date.isoformat()})
    db.commit()
    return _detail(db, inv)


@router.post("/invoices/{invoice_id}/send", response_model=InvoiceDetailOut)
def send_invoice(invoice_id: str, db: DbSession, user: User = BillingStaff, whatsapp: bool = True):
    """Issue the invoice to the patient (it becomes payable and counts toward their balance)
    and, unless ?whatsapp=false, send it to them on WhatsApp."""
    inv = _get_invoice(db, user, invoice_id)
    if inv.status == "Void":
        raise bad_request("This invoice has been voided", "INVOICE_VOID")
    if inv.status == "Draft":
        inv.status = "Sent"
    inv.sent_at = utcnow()
    svc.refresh_invoice(db, inv)
    audit.record(db, user, "send", "invoice", inv.id)
    if whatsapp:
        msg.quietly(msg.invoice_message, db, inv, "invoice_issued", user)
    db.commit()
    return _detail(db, inv)


@router.post("/invoices/{invoice_id}/void", response_model=InvoiceDetailOut)
def void_invoice(invoice_id: str, body: VoidRequest, db: DbSession, user: User = Managers):
    inv = _get_invoice(db, user, invoice_id)
    if inv.status == "Void":
        return _detail(db, inv)
    if svc.money(inv.amount_paid) > 0:
        raise bad_request("This invoice has payments recorded. Refund them before voiding.", "INVOICE_HAS_PAYMENTS")
    inv.status, inv.voided_at, inv.void_reason = "Void", utcnow(), body.reason
    svc.refresh_invoice(db, inv)
    audit.record(db, user, "void", "invoice", inv.id, after={"reason": body.reason})
    db.commit()
    return _detail(db, inv)


# ---------------------------------------------------------------------------
# Payments & installments
# ---------------------------------------------------------------------------

@router.get("/invoices/{invoice_id}/payments", response_model=list[PaymentOut])
def list_payments(invoice_id: str, user: CurrentUser, db: DbSession):
    inv = _get_invoice(db, user, invoice_id)
    return [_payment_out(p) for p in db.scalars(select(Payment).where(Payment.invoice_id == inv.id).order_by(Payment.paid_at))]


@router.post("/invoices/{invoice_id}/payments", response_model=InvoiceDetailOut, status_code=201)
def add_payment(invoice_id: str, body: PaymentIn, db: DbSession, user: User = BillingStaff):
    inv = _get_invoice(db, user, invoice_id)
    payment = svc.record_payment(db, inv, body.amount, body.method, user, body.reference_number, body.notes,
                                 paid_at=body.paid_at)
    audit.record(db, user, "payment", "invoice", inv.id,
                 after={"paymentId": payment.id, "amount": str(payment.amount), "method": payment.method})
    db.commit()
    return _detail(db, inv)


@router.put("/invoices/{invoice_id}/installments", response_model=InvoiceDetailOut)
def set_installments(invoice_id: str, body: InstallmentPlanIn, db: DbSession, user: User = BillingStaff):
    """Replace the installment schedule. Amounts must add up to the invoice total."""
    inv = _get_invoice(db, user, invoice_id)
    if inv.status == "Void":
        raise bad_request("This invoice has been voided", "INVOICE_VOID")
    total = svc.money(inv.total)
    plan: list[tuple[Decimal, datetime]] = []
    if body.installments:
        for row in body.installments:
            try:
                plan.append((svc.money(row["amount"]), as_utc(datetime.fromisoformat(str(row["dueDate"]).replace("Z", "+00:00")))))
            except (KeyError, ValueError):
                raise bad_request("Each installment needs an amount and a due date", "INVALID_INSTALLMENTS")
    elif body.count:
        first = as_utc(body.first_due_date) if body.first_due_date else inv.due_date
        each = svc.money(total / body.count)
        for n in range(body.count):
            amount = each if n < body.count - 1 else total - each * (body.count - 1)
            month = first.month - 1 + n * body.interval_months
            due = first.replace(year=first.year + month // 12, month=month % 12 + 1, day=min(first.day, 28))
            plan.append((amount, due))
    else:
        raise bad_request("Give a number of installments or the installment list", "INVALID_INSTALLMENTS")
    if any(a <= 0 for a, _ in plan):
        raise bad_request("Every installment must be more than zero", "INVALID_INSTALLMENTS")
    if sum(a for a, _ in plan) != total:
        raise bad_request(f"Installments must add up to the invoice total ({total})", "INSTALLMENTS_MISMATCH")

    for old in db.scalars(select(Installment).where(Installment.invoice_id == inv.id)):
        db.delete(old)
    db.flush()
    for i, (amount, due) in enumerate(plan, start=1):
        db.add(Installment(invoice_id=inv.id, installment_number=i, amount=amount, due_date=due))
    svc.refresh_invoice(db, inv)
    audit.record(db, user, "set_installments", "invoice", inv.id, after={"count": len(plan)})
    db.commit()
    return _detail(db, inv)


# ---------------------------------------------------------------------------
# Online payments (Razorpay)
# ---------------------------------------------------------------------------

@router.get("/payments/config", response_model=PaymentConfigOut)
def payment_config(user: CurrentUser):
    s = get_settings()
    return PaymentConfigOut(
        online_payments_enabled=s.razorpay_enabled,
        key_id=s.razorpay_key_id or None,
        currency=s.currency,
        default_gst_rate=s.default_gst_rate,
    )


@router.post("/invoices/{invoice_id}/create-payment-order", response_model=PaymentOrderOut)
def create_payment_order(invoice_id: str, user: CurrentUser, db: DbSession):
    inv = _get_invoice(db, user, invoice_id)
    if inv.status in ("Draft", "Void"):
        raise bad_request("This invoice can't be paid online yet", "INVOICE_NOT_PAYABLE")
    balance = svc.balance_due(inv)
    if balance <= 0:
        raise bad_request("This invoice is already paid", "INVOICE_PAID")
    patient = db.get(Patient, inv.patient_id)
    clinic = db.get(Clinic, inv.clinic_id)
    order = razorpay.create_order(balance, inv.invoice_number, {"invoice_id": inv.id, "patient_id": inv.patient_id})
    db.add(PaymentOrder(invoice_id=inv.id, gateway_order_id=order["id"], amount=balance, created_by_id=user.id))
    db.commit()
    return PaymentOrderOut(
        order_id=order["id"], amount=float(balance), amount_paise=razorpay.to_paise(balance),
        currency=get_settings().currency, key_id=get_settings().razorpay_key_id,
        invoice_id=inv.id, invoice_number=inv.invoice_number,
        patient_name=f"{patient.first_name} {patient.last_name}".strip(),
        patient_email=patient.email, patient_phone=patient.phone, clinic_name=clinic.name if clinic else "",
    )


def _complete_order(db: Session, order: PaymentOrder, payment_id: str, method: str, actor: User | None) -> Invoice:
    inv = db.get(Invoice, order.invoice_id)
    svc.record_payment(db, inv, order.amount, method, actor, reference=payment_id,
                       notes="Paid online via Razorpay", source="razorpay", gateway_payment_id=payment_id)
    order.status = "paid"
    msg.quietly(msg.invoice_message, db, inv, "payment_receipt", actor, amount=order.amount,
                dedupe_key=f"receipt:{payment_id}")
    return inv


@router.post("/payments/razorpay/verify", response_model=InvoiceDetailOut)
def verify_razorpay_payment(body: VerifyPaymentIn, user: CurrentUser, db: DbSession):
    """Called by the browser after Razorpay Checkout succeeds."""
    order = db.scalars(select(PaymentOrder).where(PaymentOrder.gateway_order_id == body.razorpay_order_id)).first()
    if not order:
        raise not_found("Payment order")
    _get_invoice(db, user, order.invoice_id)  # access check
    if not razorpay.verify_payment_signature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature):
        raise AppError(400, "Payment could not be verified", "INVALID_SIGNATURE")
    inv = _complete_order(db, order, body.razorpay_payment_id, "Online", user)
    audit.record(db, user, "online_payment", "invoice", inv.id, after={"paymentId": body.razorpay_payment_id})
    db.commit()
    return _detail(db, inv)


@router.post("/webhooks/razorpay/payment-success", status_code=200)
async def razorpay_webhook(request: Request, db: DbSession):
    """Server-to-server confirmation from Razorpay (event: payment.captured).

    The signature is checked against the raw body before anything is trusted.
    Duplicate deliveries are harmless: payments are unique on the Razorpay payment id.
    """
    body = await request.body()
    if not razorpay.verify_webhook_signature(body, request.headers.get("X-Razorpay-Signature")):
        raise AppError(400, "Invalid signature", "INVALID_SIGNATURE")
    event = json.loads(body or b"{}")
    if event.get("event") not in ("payment.captured", "order.paid"):
        return {"status": "ignored"}
    entity = (event.get("payload", {}).get("payment", {}) or {}).get("entity", {})
    order_id, payment_id = entity.get("order_id"), entity.get("id")
    order = db.scalars(select(PaymentOrder).where(PaymentOrder.gateway_order_id == order_id)).first() if order_id else None
    if not order or not payment_id:
        return {"status": "unknown_order"}
    method = {"upi": "UPI", "card": "Card", "netbanking": "Bank Transfer"}.get(entity.get("method", ""), "Online")
    inv = _complete_order(db, order, payment_id, method, None)
    audit.record(db, None, "online_payment", "invoice", inv.id, after={"paymentId": payment_id, "via": "webhook"})
    db.commit()
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Insurance claims
# ---------------------------------------------------------------------------

@router.get("/insurance-claims", response_model=list[ClaimOut])
def list_claims(user: StaffUser, db: DbSession, status: str | None = None):
    query = (
        select(InsuranceClaim, Invoice, Patient)
        .join(Invoice, Invoice.id == InsuranceClaim.invoice_id)
        .join(Patient, Patient.id == InsuranceClaim.patient_id)
        .order_by(InsuranceClaim.submitted_at.desc())
    )
    allowed = accessible_clinic_ids(user)
    if allowed is not None:
        query = query.where(Invoice.clinic_id.in_(allowed))
    if status:
        query = query.where(InsuranceClaim.status.in_(status.split(",")))
    return [_claim_out(c, inv, p) for c, inv, p in db.execute(query).all()]


@router.post("/insurance-claims", response_model=ClaimOut, status_code=201)
def create_claim(body: ClaimIn, db: DbSession, user: User = BillingStaff):
    inv = _get_invoice(db, user, body.invoice_id)
    if inv.status in ("Draft", "Void"):
        raise bad_request("Send the invoice before filing a claim", "INVOICE_NOT_ISSUED")
    if svc.money(body.claim_amount) > svc.money(inv.total):
        raise bad_request("Claim amount can't be more than the invoice total", "CLAIM_TOO_HIGH")
    claim = InsuranceClaim(invoice_id=inv.id, patient_id=inv.patient_id, provider_name=body.provider_name,
                           policy_number=body.policy_number, claim_amount=svc.money(body.claim_amount), notes=body.notes)
    db.add(claim)
    db.flush()
    audit.record(db, user, "create", "insurance_claim", claim.id, after=body)
    db.commit()
    return _claim_out(claim, inv, db.get(Patient, inv.patient_id))


@router.patch("/insurance-claims/{claim_id}", response_model=ClaimOut)
def update_claim(claim_id: str, body: ClaimUpdate, db: DbSession, user: User = BillingStaff):
    """Track the insurer's decision. Marking a claim Paid records the approved amount as a payment."""
    claim = db.get(InsuranceClaim, claim_id)
    if not claim:
        raise not_found("Insurance claim")
    inv = _get_invoice(db, user, claim.invoice_id)
    data = body.model_dump(exclude_unset=True)
    if "approved_amount" in data and data["approved_amount"] is not None:
        if svc.money(data["approved_amount"]) > svc.money(claim.claim_amount):
            raise bad_request("Approved amount can't exceed the claim amount", "APPROVED_TOO_HIGH")
        claim.approved_amount = svc.money(data["approved_amount"])
    if "notes" in data:
        claim.notes = data["notes"]
    new_status = data.get("status")
    if new_status:
        if new_status == "Paid" and claim.status != "Paid":
            amount = claim.approved_amount if claim.approved_amount is not None else claim.claim_amount
            amount = min(svc.money(amount), svc.money(inv.total) - svc.money(inv.amount_paid))
            if amount > 0:
                payment = svc.record_payment(db, inv, amount, "Insurance", user,
                                             reference=f"Claim {claim.id[:8]}", notes=claim.provider_name,
                                             source="insurance")
                claim.payment_id = payment.id
        claim.status = new_status
    audit.record(db, user, "update", "insurance_claim", claim.id, after=data)
    db.commit()
    return _claim_out(claim, inv, db.get(Patient, claim.patient_id))


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

def _month_key(dt: datetime) -> str:
    return as_utc(dt).strftime("%Y-%m")


@router.get("/reports/revenue")
def revenue_report(
    db: DbSession,
    user: User = Managers,
    clinic_id: str | None = Query(default=None, alias="clinicId"),
    months: int = Query(default=6, ge=1, le=24),
):
    """Collections (payments received) and billing (invoices issued) by month, method and clinic."""
    now = datetime.now(timezone.utc)
    start = (now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=31 * (months - 1))).replace(day=1)
    allowed = accessible_clinic_ids(user)

    pay_q = select(Payment, Invoice.clinic_id).join(Invoice, Invoice.id == Payment.invoice_id).where(Payment.paid_at >= start)
    inv_q = select(Invoice).where(Invoice.created_at >= start, Invoice.status.in_(svc.OPEN_STATUSES))
    if allowed is not None:
        pay_q = pay_q.where(Invoice.clinic_id.in_(allowed))
        inv_q = inv_q.where(Invoice.clinic_id.in_(allowed))
    if clinic_id and clinic_id != "all":
        pay_q = pay_q.where(Invoice.clinic_id == clinic_id)
        inv_q = inv_q.where(Invoice.clinic_id == clinic_id)
    payments = db.execute(pay_q).all()
    invoices = db.scalars(inv_q).all()

    month_keys = []
    cursor = start
    while cursor <= now:
        month_keys.append(cursor.strftime("%Y-%m"))
        cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
    collected = {k: Decimal(0) for k in month_keys}
    billed = {k: Decimal(0) for k in month_keys}
    by_method: dict[str, Decimal] = {}
    by_clinic: dict[str, Decimal] = {}
    for p, cid in payments:
        collected[_month_key(p.paid_at)] = collected.get(_month_key(p.paid_at), Decimal(0)) + p.amount
        by_method[p.method] = by_method.get(p.method, Decimal(0)) + p.amount
        by_clinic[cid] = by_clinic.get(cid, Decimal(0)) + p.amount
    for inv in invoices:
        billed[_month_key(inv.created_at)] = billed.get(_month_key(inv.created_at), Decimal(0)) + inv.total

    clinic_names = {c.id: c.name for c in db.scalars(select(Clinic))}
    return {
        "trend": [
            {"month": k, "name": datetime.strptime(k, "%Y-%m").strftime("%b"),
             "revenue": float(collected[k]), "billed": float(billed[k])}
            for k in month_keys
        ],
        "totalCollected": float(sum(collected.values())),
        "totalBilled": float(sum(billed.values())),
        "byMethod": [{"method": m, "amount": float(a)} for m, a in sorted(by_method.items(), key=lambda x: -x[1])],
        "byClinic": [{"clinicId": c, "name": clinic_names.get(c, c), "amount": float(a)}
                     for c, a in sorted(by_clinic.items(), key=lambda x: -x[1])],
    }


@router.get("/reports/outstanding")
def outstanding_report(user: StaffUser, db: DbSession, clinic_id: str | None = Query(default=None, alias="clinicId")):
    """Unpaid balances per patient with ageing buckets (days past due)."""
    query = select(Invoice, Patient).join(Patient, Patient.id == Invoice.patient_id).where(
        Invoice.status.in_(svc.UNPAID_STATUSES)
    )
    allowed = accessible_clinic_ids(user)
    if allowed is not None:
        query = query.where(Invoice.clinic_id.in_(allowed))
    if clinic_id and clinic_id != "all":
        query = query.where(Invoice.clinic_id == clinic_id)
    rows = db.execute(query).all()
    svc.refresh_overdue(db, [inv for inv, _ in rows])

    now = datetime.now(timezone.utc)
    buckets = {"current": Decimal(0), "1-30": Decimal(0), "31-60": Decimal(0), "61-90": Decimal(0), "90+": Decimal(0)}
    patients: dict[str, dict] = {}
    for inv, p in rows:
        bal = svc.balance_due(inv)
        if bal <= 0:
            continue
        days = (now - as_utc(inv.due_date)).days
        key = "current" if days <= 0 else "1-30" if days <= 30 else "31-60" if days <= 60 else "61-90" if days <= 90 else "90+"
        buckets[key] += bal
        entry = patients.setdefault(p.id, {
            "patientId": p.id, "patientName": f"{p.first_name} {p.last_name}".strip(), "phone": p.phone,
            "balance": Decimal(0), "invoiceCount": 0, "oldestDueDate": inv.due_date, "maxDaysOverdue": 0,
        })
        entry["balance"] += bal
        entry["invoiceCount"] += 1
        entry["oldestDueDate"] = min(entry["oldestDueDate"], inv.due_date)
        entry["maxDaysOverdue"] = max(entry["maxDaysOverdue"], max(days, 0))
    items = sorted(patients.values(), key=lambda e: (-e["maxDaysOverdue"], -e["balance"]))
    for e in items:
        e["balance"] = float(e["balance"])
        e["oldestDueDate"] = as_utc(e["oldestDueDate"]).isoformat()
    return {
        "total": float(sum(buckets.values())),
        "buckets": [{"bucket": k, "amount": float(v)} for k, v in buckets.items()],
        "patients": items,
    }


# ---------------------------------------------------------------------------
# Patient portal
# ---------------------------------------------------------------------------

@router.get("/patient-portal/invoices", response_model=list[InvoiceOut])
def my_invoices(db: DbSession, user: User = Depends(require_roles("patient"))):
    if not user.patient_id:
        raise forbidden("This login is not linked to a patient record")
    invoices = db.scalars(
        select(Invoice).where(Invoice.patient_id == user.patient_id, Invoice.status != "Draft")
        .order_by(Invoice.created_at.desc())
    ).all()
    svc.refresh_overdue(db, list(invoices))
    patient = db.get(Patient, user.patient_id)
    flags = _with_installment_flags(db, list(invoices))
    return [_invoice_out(i, patient, i.id in flags) for i in invoices]
