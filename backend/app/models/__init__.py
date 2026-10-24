"""SQLAlchemy models.

IDs are strings: new rows get UUIDv4 values, while seeded demo rows keep the
IDs from the frontend mock data (e.g. "pat_1") so existing links keep working.
Nested structures that the frontend treats as one object (address, medical
history, working hours...) are stored as JSONB columns.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, JSONType


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class Clinic(TimestampMixin, Base):
    __tablename__ = "clinics"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    address: Mapped[dict | None] = mapped_column(JSONType)
    phone: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata")
    operating_hours: Mapped[list | None] = mapped_column(JSONType)
    logo_url: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)  # active | inactive


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # super_admin | admin | dentist | receptionist | patient
    clinic_id: Mapped[str | None] = mapped_column(ForeignKey("clinics.id", ondelete="SET NULL"))
    # Set for role=patient: links the login to its patient record.
    patient_id: Mapped[str | None] = mapped_column(ForeignKey("patients.id", ondelete="SET NULL"), unique=True)
    phone: Mapped[str | None] = mapped_column(String(40))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Bumped on logout / password reset to invalidate outstanding refresh tokens.
    token_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    staff_profile: Mapped["StaffProfile | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan", lazy="joined"
    )


class StaffProfile(Base):
    __tablename__ = "staff_profiles"

    id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    clinic_ids: Mapped[list] = mapped_column(JSONType, default=list)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)  # active | on_leave | inactive
    specializations: Mapped[list] = mapped_column(JSONType, default=list)
    license_number: Mapped[str | None] = mapped_column(String(100))
    working_hours: Mapped[list | None] = mapped_column(JSONType)
    date_joined: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="staff_profile")


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    clinic_id: Mapped[str | None] = mapped_column(ForeignKey("clinics.id", ondelete="SET NULL"), index=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    phone: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(255))
    dob: Mapped[str | None] = mapped_column(String(10))  # YYYY-MM-DD
    gender: Mapped[str | None] = mapped_column(String(30))
    address: Mapped[dict | str | None] = mapped_column(JSONType)
    communication_prefs: Mapped[dict | None] = mapped_column(JSONType)
    emergency_contact: Mapped[dict | None] = mapped_column(JSONType)
    medical_history: Mapped[dict | None] = mapped_column(JSONType)
    dental_history: Mapped[dict | None] = mapped_column(JSONType)
    insurance: Mapped[dict | None] = mapped_column(JSONType)
    referral_source: Mapped[str | None] = mapped_column(String(100))
    tags: Mapped[list] = mapped_column(JSONType, default=list)
    last_visit: Mapped[str | None] = mapped_column(String(32))
    outstanding_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    # Pending profile edit submitted by the patient from the portal, awaiting staff review.
    edit_request: Mapped[dict | None] = mapped_column(JSONType)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Appointment(TimestampMixin, Base):
    __tablename__ = "appointments"
    __table_args__ = (Index("ix_appointments_dentist_start", "dentist_id", "start_time"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    dentist_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # scheduled | confirmed | in_progress | completed | cancelled | no_show
    status: Mapped[str] = mapped_column(String(20), default="scheduled", nullable=False)
    procedure_type: Mapped[str] = mapped_column(String(100), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


class WaitlistEntry(Base):
    __tablename__ = "waitlist_entries"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    preferred_dentist_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    preferred_date_range: Mapped[str] = mapped_column(String(200), default="")
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="waiting", nullable=False)  # waiting | scheduled | cancelled
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    before_state: Mapped[dict | None] = mapped_column(JSONType)
    after_state: Mapped[dict | None] = mapped_column(JSONType)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


class AppSetting(Base):
    """Key/value store for platform-wide JSON settings (RBAC matrix, subscription)."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[dict | list] = mapped_column(JSONType, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


# ---------------------------------------------------------------------------
# Billing
# ---------------------------------------------------------------------------

class Procedure(Base):
    """Procedure catalog used for invoice lines and (later) treatment plans."""

    __tablename__ = "procedures"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    clinic_id: Mapped[str | None] = mapped_column(ForeignKey("clinics.id", ondelete="CASCADE"))  # None = all clinics
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(100), default="General", nullable=False)
    default_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    default_duration_minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    # Most dental treatment by a clinical establishment is GST-exempt; cosmetic work is taxable.
    gst_applicable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class InvoiceCounter(Base):
    """Year-wise running number for invoice numbers (INV-2026-0001)."""

    __tablename__ = "invoice_counters"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_number: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Invoice(TimestampMixin, Base):
    __tablename__ = "invoices"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    invoice_number: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="RESTRICT"), nullable=False, index=True)
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    treatment_plan_id: Mapped[str | None] = mapped_column(String(64))
    # [{id, procedureId, procedureName, toothNumber, quantity, unitCost, total, taxable}]
    line_items: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)  # as entered
    discount_type: Mapped[str] = mapped_column(String(12), default="flat", nullable=False)  # flat | percentage
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=18, nullable=False)  # GST % on taxable lines
    inter_state: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # IGST instead of CGST+SGST
    tax_breakdown: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    total_tax: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    # Draft | Sent | Partially Paid | Paid | Overdue | Void
    status: Mapped[str] = mapped_column(String(20), default="Draft", nullable=False, index=True)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    void_reason: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    invoice_id: Mapped[str] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    method: Mapped[str] = mapped_column(String(30), nullable=False)  # Cash | Card | UPI | Bank Transfer | Cheque | Insurance
    reference_number: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(20), default="manual", nullable=False)  # manual | razorpay | insurance
    # Razorpay payment id: unique so the webhook and the browser callback can't record a payment twice.
    gateway_payment_id: Mapped[str | None] = mapped_column(String(100), unique=True)
    recorded_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


class Installment(Base):
    __tablename__ = "installments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    invoice_id: Mapped[str] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    installment_number: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(12), default="Pending", nullable=False)  # Pending | Paid | Overdue


class InsuranceClaim(TimestampMixin, Base):
    __tablename__ = "insurance_claims"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    invoice_id: Mapped[str] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False)
    provider_name: Mapped[str] = mapped_column(String(200), nullable=False)
    policy_number: Mapped[str | None] = mapped_column(String(100))
    claim_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    approved_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    # Submitted | Under Review | Approved | Rejected | Paid
    status: Mapped[str] = mapped_column(String(20), default="Submitted", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    payment_id: Mapped[str | None] = mapped_column(ForeignKey("payments.id", ondelete="SET NULL"))


class PaymentOrder(Base):
    """An online payment attempt (Razorpay order) for an invoice."""

    __tablename__ = "payment_orders"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    invoice_id: Mapped[str] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    gateway_order_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="created", nullable=False)  # created | paid | failed
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
