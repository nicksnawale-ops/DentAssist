"""SQLAlchemy models.

IDs are strings: new rows get UUIDv4 values, while seeded demo rows keep the
IDs from the frontend mock data (e.g. "pat_1") so existing links keep working.
Nested structures that the frontend treats as one object (address, medical
history, working hours...) are stored as JSONB columns.
"""

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, true
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
    # Public booking page at /book/<clinic id>
    online_booking_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true(), nullable=False)
    # Google Business review link sent to patients after a visit (e.g. https://g.page/r/.../review)
    google_review_url: Mapped[str | None] = mapped_column(String(500))
    # Key in the reception QR code for self check-in. Regenerate to retire printed posters.
    checkin_token: Mapped[str | None] = mapped_column(String(64))
    # Key for posting leads from Facebook/Instagram lead forms (via Zapier, Make or similar).
    lead_token: Mapped[str | None] = mapped_column(String(64))


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
    # Family: members share one account holder (the head), who can manage everyone from their login.
    family_id: Mapped[str | None] = mapped_column(ForeignKey("families.id", ondelete="SET NULL"), index=True)
    family_relation: Mapped[str | None] = mapped_column(String(20))  # Self | Spouse | Child | Parent | Sibling | Other
    # Set when the patient's identity was erased on request (records kept for the law, without who they were).
    anonymised_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
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
    # When the patient arrived (self check-in by QR, or the front desk), before going into the chair.
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


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
    # The dentist the work is credited to (for revenue per dentist)
    dentist_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
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


# ---------------------------------------------------------------------------
# Clinical records
# ---------------------------------------------------------------------------

class ToothRecord(Base):
    """Current state of one tooth (FDI number) for a patient."""

    __tablename__ = "tooth_records"
    __table_args__ = (Index("uq_tooth_records_patient_tooth", "patient_id", "tooth_number", unique=True),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    tooth_number: Mapped[str] = mapped_column(String(3), nullable=False)
    conditions: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class ToothEvent(Base):
    """Append-only history of tooth changes; also lets the chart be viewed as of a past date."""

    __tablename__ = "tooth_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    tooth_number: Mapped[str] = mapped_column(String(3), nullable=False)
    action: Mapped[str] = mapped_column(String(300), nullable=False)
    conditions: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    author_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


class PerioReading(Base):
    __tablename__ = "periodontal_readings"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    tooth_number: Mapped[str] = mapped_column(String(3), nullable=False)
    # {"buccal": [d, m, d], "lingual": [d, m, d]} pocket depths in mm
    measurement_points: Mapped[dict] = mapped_column(JSONType, nullable=False)
    bleeding_on_probing: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    recorded_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


class TreatmentPlan(TimestampMixin, Base):
    __tablename__ = "treatment_plans"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Draft | Proposed | Approved | In Progress | Completed
    status: Mapped[str] = mapped_column(String(20), default="Draft", nullable=False, index=True)
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    discount_type: Mapped[str] = mapped_column(String(12), default="flat", nullable=False)
    discount_reason: Mapped[str | None] = mapped_column(String(300))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    invoice_id: Mapped[str | None] = mapped_column(ForeignKey("invoices.id", ondelete="SET NULL"))
    # Plain-language explanation for the patient: {language, summary, steps[], aftercare, questions[],
    # generatedBy, editedBy, shared, sharedAt, updatedAt}
    patient_explanation: Mapped[dict | None] = mapped_column(JSONType)

    items: Mapped[list["TreatmentPlanItem"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan", order_by="TreatmentPlanItem.sort_order", lazy="selectin"
    )


class TreatmentPlanItem(Base):
    __tablename__ = "treatment_plan_items"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    plan_id: Mapped[str] = mapped_column(ForeignKey("treatment_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    procedure_id: Mapped[str | None] = mapped_column(ForeignKey("procedures.id", ondelete="SET NULL"))
    procedure_name: Mapped[str] = mapped_column(String(200), nullable=False)
    tooth_number: Mapped[str | None] = mapped_column(String(40))
    cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    taxable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(12), default="Pending", nullable=False)  # Pending | Scheduled | Completed
    linked_appointment_id: Mapped[str | None] = mapped_column(ForeignKey("appointments.id", ondelete="SET NULL"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    plan: Mapped[TreatmentPlan] = relationship(back_populates="items")


class ClinicalNote(Base):
    """SOAP note. Editable by its author for 24 hours, then locked (add a new note to correct it)."""

    __tablename__ = "clinical_notes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    appointment_id: Mapped[str | None] = mapped_column(ForeignKey("appointments.id", ondelete="SET NULL"))
    subjective: Mapped[str] = mapped_column(Text, default="", nullable=False)
    objective: Mapped[str] = mapped_column(Text, default="", nullable=False)
    assessment: Mapped[str] = mapped_column(Text, default="", nullable=False)
    plan: Mapped[str] = mapped_column(Text, default="", nullable=False)
    author_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


# ---------------------------------------------------------------------------
# Messaging (WhatsApp)
# ---------------------------------------------------------------------------

class MessageLog(Base):
    """Every WhatsApp message in or out, with delivery status from the provider."""

    __tablename__ = "message_logs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    patient_id: Mapped[str | None] = mapped_column(ForeignKey("patients.id", ondelete="SET NULL"), index=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # E.164 digits, e.g. 919876511111
    direction: Mapped[str] = mapped_column(String(10), default="outbound", nullable=False)  # outbound | inbound
    channel: Mapped[str] = mapped_column(String(12), default="whatsapp", nullable=False)
    # Template key (reminder_24h, booking_confirmation...), "text" for free-form replies, "inbound" for patient messages
    kind: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    template_name: Mapped[str | None] = mapped_column(String(100))
    body: Mapped[str] = mapped_column(Text, default="", nullable=False)  # human-readable copy of what was sent/received
    # queued | sent | delivered | read | failed | skipped | received
    status: Mapped[str] = mapped_column(String(12), default="queued", nullable=False, index=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(120), unique=True)
    error: Mapped[str | None] = mapped_column(Text)
    appointment_id: Mapped[str | None] = mapped_column(ForeignKey("appointments.id", ondelete="SET NULL"), index=True)
    invoice_id: Mapped[str | None] = mapped_column(ForeignKey("invoices.id", ondelete="SET NULL"))
    payload: Mapped[dict | None] = mapped_column(JSONType)
    # Stops the same automatic message going out twice, e.g. "<appointment id>:reminder_24h".
    dedupe_key: Mapped[str | None] = mapped_column(String(150), unique=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class Recall(TimestampMixin, Base):
    """A patient who should come back: a routine checkup, or an unfinished treatment plan."""

    __tablename__ = "recalls"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # checkup | treatment
    treatment_plan_id: Mapped[str | None] = mapped_column(ForeignKey("treatment_plans.id", ondelete="CASCADE"))
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # due | contacted | booked | dismissed
    status: Mapped[str] = mapped_column(String(12), default="due", nullable=False, index=True)
    reason: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    last_visit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    contact_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_contacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    appointment_id: Mapped[str | None] = mapped_column(ForeignKey("appointments.id", ondelete="SET NULL"))
    booked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)


class Medicine(TimestampMixin, Base):
    """Medicine catalogue used to write prescriptions quickly."""

    __tablename__ = "medicines"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)  # brand or common name
    generic_name: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    form: Mapped[str] = mapped_column(String(30), default="Tablet", nullable=False)  # Tablet, Capsule, Syrup, Gel...
    strength: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    default_dosage: Mapped[str] = mapped_column(String(50), default="1 tablet", nullable=False)
    default_frequency: Mapped[str] = mapped_column(String(20), default="1-0-1", nullable=False)  # morning-noon-night
    default_duration_days: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    default_timing: Mapped[str] = mapped_column(String(30), default="After food", nullable=False)
    default_instructions: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    # Drug class used for allergy checks, e.g. "penicillin", "nsaid"
    drug_class: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Prescription(TimestampMixin, Base):
    __tablename__ = "prescriptions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)  # RX-2026-0001
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    dentist_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    appointment_id: Mapped[str | None] = mapped_column(ForeignKey("appointments.id", ondelete="SET NULL"))
    diagnosis: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    # [{medicineId, name, genericName, form, strength, dosage, frequency, durationDays, timing, instructions}]
    items: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    advice: Mapped[str | None] = mapped_column(Text)
    follow_up_date: Mapped[date | None] = mapped_column(Date)
    # Allergy warnings the dentist saw and accepted when issuing
    acknowledged_warnings: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    status: Mapped[str] = mapped_column(String(12), default="issued", nullable=False)  # issued | cancelled
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(String(300))


class ConsentTemplate(TimestampMixin, Base):
    __tablename__ = "consent_templates"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    # Text with placeholders: {patient_name} {procedure} {teeth} {dentist} {clinic} {date}
    body: Mapped[str] = mapped_column(Text, nullable=False)
    risks: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ConsentForm(TimestampMixin, Base):
    """A consent prepared for one patient. Once signed, its text and signature never change."""

    __tablename__ = "consent_forms"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    template_id: Mapped[str | None] = mapped_column(ForeignKey("consent_templates.id", ondelete="SET NULL"))
    template_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)  # rendered text the patient agrees to
    risks: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    procedure: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    teeth: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    dentist_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    treatment_plan_id: Mapped[str | None] = mapped_column(ForeignKey("treatment_plans.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(12), default="pending", nullable=False, index=True)  # pending|signed|revoked
    # Remote signing link: only the SHA-256 of the token is stored.
    sign_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    sign_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    signature: Mapped[str | None] = mapped_column(Text)  # PNG data URL
    signed_by_name: Mapped[str | None] = mapped_column(String(150))
    signer_relationship: Mapped[str | None] = mapped_column(String(30))  # Self | Parent | Guardian | Spouse
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    signed_via: Mapped[str | None] = mapped_column(String(20))  # clinic_device | remote_link | patient_portal
    witness_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    signer_ip: Mapped[str | None] = mapped_column(String(64))
    signer_user_agent: Mapped[str | None] = mapped_column(String(300))
    # SHA-256 over the text, signature and signing time: proves nothing changed afterwards
    content_hash: Mapped[str | None] = mapped_column(String(64))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoke_reason: Mapped[str | None] = mapped_column(String(300))
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class Supplier(TimestampMixin, Base):
    """A supplier of stock, or a dental lab (is_lab)."""

    __tablename__ = "suppliers"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    contact_person: Mapped[str] = mapped_column(String(150), default="", nullable=False)
    phone: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    email: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    address: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    items_supplied: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    is_lab: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    turnaround_days: Mapped[int | None] = mapped_column(Integer)  # labs: usual working days
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class InventoryItem(TimestampMixin, Base):
    __tablename__ = "inventory_items"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    sku: Mapped[str | None] = mapped_column(String(60))
    category: Mapped[str] = mapped_column(String(30), default="Consumables", nullable=False)
    unit: Mapped[str] = mapped_column(String(40), default="pieces", nullable=False)
    current_stock: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reorder_threshold: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reorder_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    supplier_id: Mapped[str | None] = mapped_column(ForeignKey("suppliers.id", ondelete="SET NULL"))
    expiry_date: Mapped[date | None] = mapped_column(Date)
    batch_number: Mapped[str | None] = mapped_column(String(60))
    location: Mapped[str | None] = mapped_column(String(100))
    last_restocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Set when the item last dropped to its reorder level, so the alert is sent once per dip.
    low_stock_alerted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    item_id: Mapped[str] = mapped_column(ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False, index=True)
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    change: Mapped[int] = mapped_column(Integer, nullable=False)
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    type: Mapped[str] = mapped_column(String(12), nullable=False)  # received | usage | adjustment | expired | returned
    reason: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    appointment_id: Mapped[str | None] = mapped_column(ForeignKey("appointments.id", ondelete="SET NULL"))
    purchase_order_id: Mapped[str | None] = mapped_column(ForeignKey("purchase_orders.id", ondelete="SET NULL"))
    recorded_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


class PurchaseOrder(TimestampMixin, Base):
    __tablename__ = "purchase_orders"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    po_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    supplier_id: Mapped[str] = mapped_column(ForeignKey("suppliers.id"), nullable=False)
    # Draft | Sent | Partially Received | Received | Cancelled
    status: Mapped[str] = mapped_column(String(20), default="Draft", nullable=False, index=True)
    # [{itemId, name, unit, quantity, unitPrice, receivedQuantity}]
    items: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    expected_date: Mapped[date | None] = mapped_column(Date)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LabOrder(TimestampMixin, Base):
    __tablename__ = "lab_orders"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    order_number: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)  # LAB-2026-0001
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    lab_id: Mapped[str] = mapped_column(ForeignKey("suppliers.id"), nullable=False, index=True)
    dentist_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    item_type: Mapped[str] = mapped_column(String(40), nullable=False)
    tooth_numbers: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    shade: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    material: Mapped[str] = mapped_column(String(80), default="", nullable=False)
    instructions: Mapped[str | None] = mapped_column(Text)
    # Ordered | In Progress | Quality Check | Ready for Pickup | Delivered to Clinic | Fitted/Completed | Cancelled
    status: Mapped[str] = mapped_column(String(24), default="Ordered", nullable=False, index=True)
    order_date: Mapped[date] = mapped_column(Date, nullable=False)
    expected_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    treatment_plan_item_id: Mapped[str | None] = mapped_column(ForeignKey("treatment_plan_items.id", ondelete="SET NULL"))
    remake_of_id: Mapped[str | None] = mapped_column(ForeignKey("lab_orders.id", ondelete="SET NULL"))
    remake_reason: Mapped[str | None] = mapped_column(String(300))
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class LabOrderUpdate(Base):
    __tablename__ = "lab_order_updates"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    lab_order_id: Mapped[str] = mapped_column(ForeignKey("lab_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    note: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class PatientDocument(TimestampMixin, Base):
    """An X-ray, photo, report or other file in a patient's record."""

    __tablename__ = "patient_documents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    clinic_id: Mapped[str | None] = mapped_column(ForeignKey("clinics.id", ondelete="SET NULL"), index=True)
    # X-Ray | Intraoral Photo | Lab Report | Consent Form | Insurance Document | Prescription | Other
    type: Mapped[str] = mapped_column(String(30), default="Other", nullable=False, index=True)
    xray_kind: Mapped[str | None] = mapped_column(String(30))  # IOPA | Bitewing | OPG | CBCT | Cephalometric
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    storage_key: Mapped[str] = mapped_column(String(300), nullable=False)
    thumbnail_key: Mapped[str | None] = mapped_column(String(300))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    teeth: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    tags: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    taken_at: Mapped[date | None] = mapped_column(Date, index=True)
    # [{id, kind: arrow|circle|line|text, x, y, x2?, y2?, r?, text?, color, by, at}] in 0..1 image coordinates
    annotations: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)
    shared_with_patient: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    treatment_plan_id: Mapped[str | None] = mapped_column(ForeignKey("treatment_plans.id", ondelete="SET NULL"))
    clinical_note_id: Mapped[str | None] = mapped_column(ForeignKey("clinical_notes.id", ondelete="SET NULL"))
    uploaded_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    uploaded_by_patient: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    deleted_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class CompensationPlan(TimestampMixin, Base):
    """How a dentist is paid. One active plan per dentist and clinic (clinic empty = all clinics)."""

    __tablename__ = "compensation_plans"
    __table_args__ = (UniqueConstraint("staff_id", "clinic_id", name="uq_compensation_staff_clinic"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    staff_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    clinic_id: Mapped[str | None] = mapped_column(ForeignKey("clinics.id", ondelete="CASCADE"))
    arrangement: Mapped[str] = mapped_column(String(20), default="associate", nullable=False)  # associate | consultant | salaried
    basis: Mapped[str] = mapped_column(String(12), default="collections", nullable=False)  # collections | billing
    percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0, nullable=False)
    lab_share_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0, nullable=False)  # of lab bills borne by the dentist
    fixed_monthly: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    minimum_guarantee: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    tds_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=10, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Payout(TimestampMixin, Base):
    """A dentist's monthly statement. Figures are recalculated while draft and frozen once approved."""

    __tablename__ = "payouts"
    __table_args__ = (UniqueConstraint("staff_id", "clinic_key", "period", name="uq_payout_staff_clinic_period"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    staff_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    clinic_id: Mapped[str | None] = mapped_column(ForeignKey("clinics.id", ondelete="SET NULL"))
    clinic_key: Mapped[str] = mapped_column(String(64), default="all", nullable=False)  # clinic id or "all" (for uniqueness)
    period: Mapped[str] = mapped_column(String(7), nullable=False, index=True)  # 2026-10
    status: Mapped[str] = mapped_column(String(10), default="draft", nullable=False, index=True)  # draft | approved | paid
    figures: Mapped[dict] = mapped_column(JSONType, default=dict, nullable=False)
    adjustments: Mapped[list] = mapped_column(JSONType, default=list, nullable=False)  # [{id, label, amount}]
    net_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    computed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    payment_method: Mapped[str | None] = mapped_column(String(30))
    payment_reference: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)


class AttendanceRecord(TimestampMixin, Base):
    __tablename__ = "attendance_records"
    __table_args__ = (UniqueConstraint("staff_id", "day", name="uq_attendance_staff_day"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    staff_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    clinic_id: Mapped[str | None] = mapped_column(ForeignKey("clinics.id", ondelete="SET NULL"), index=True)
    day: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(10), default="present", nullable=False)  # present | half_day | leave | absent | holiday
    check_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    check_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    late_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    source: Mapped[str] = mapped_column(String(10), default="self", nullable=False)  # self | admin
    note: Mapped[str | None] = mapped_column(String(300))
    edited_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class Family(TimestampMixin, Base):
    __tablename__ = "families"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    # The account holder: their portal login can see and book for everyone in the family.
    head_patient_id: Mapped[str] = mapped_column(String(64), nullable=False)
    clinic_id: Mapped[str | None] = mapped_column(ForeignKey("clinics.id", ondelete="SET NULL"))


# ---------------------------------------------------------------------------
# Leads (enquiries before someone becomes a patient)
# ---------------------------------------------------------------------------

class Lead(TimestampMixin, Base):
    """Someone who enquired: website form, WhatsApp, Instagram, a call or a walk-in."""

    __tablename__ = "leads"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # E.164 digits, e.g. 919876511111
    email: Mapped[str | None] = mapped_column(String(255))
    # website | whatsapp | instagram | facebook | google | practo | justdial | referral | walk_in | phone | other
    source: Mapped[str] = mapped_column(String(20), default="other", nullable=False, index=True)
    interest: Mapped[str | None] = mapped_column(String(100))  # what they asked about: implants, braces...
    message: Mapped[str | None] = mapped_column(Text)
    # new | contacted | consult_booked | visited | won | lost
    status: Mapped[str] = mapped_column(String(16), default="new", nullable=False, index=True)
    lost_reason: Mapped[str | None] = mapped_column(String(40))
    estimated_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    assigned_to_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    next_follow_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    follow_up_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_contacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_contacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    contact_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    language: Mapped[str] = mapped_column(String(5), default="en", nullable=False)
    whatsapp_consent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Set once they become a patient (registered, or matched by mobile number).
    patient_id: Mapped[str | None] = mapped_column(ForeignKey("patients.id", ondelete="SET NULL"), index=True)
    appointment_id: Mapped[str | None] = mapped_column(ForeignKey("appointments.id", ondelete="SET NULL"))
    converted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    referred_by_patient_id: Mapped[str | None] = mapped_column(ForeignKey("patients.id", ondelete="SET NULL"))
    campaign: Mapped[dict | None] = mapped_column(JSONType)  # utm_source, utm_campaign, ad name...
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class LeadActivity(Base):
    __tablename__ = "lead_activities"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    lead_id: Mapped[str] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    # created | enquired_again | note | call | whatsapp | status | assigned | follow_up | converted
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    body: Mapped[str] = mapped_column(Text, default="", nullable=False)
    outcome: Mapped[str | None] = mapped_column(String(20))  # for calls: answered | no_answer | busy | wrong_number
    data: Mapped[dict | None] = mapped_column(JSONType)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


# ---------------------------------------------------------------------------
# Sterilisation (infection control) and instrument tracing
# ---------------------------------------------------------------------------

class Steriliser(TimestampMixin, Base):
    __tablename__ = "sterilisers"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), default="autoclave_b", nullable=False)  # autoclave_b | autoclave_n | autoclave_s | dry_heat | other
    serial_number: Mapped[str | None] = mapped_column(String(100))
    last_serviced_on: Mapped[date | None] = mapped_column(Date)
    service_interval_days: Mapped[int] = mapped_column(Integer, default=180, nullable=False)
    validated_on: Mapped[date | None] = mapped_column(Date)  # last performance validation / qualification
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    out_of_service_reason: Mapped[str | None] = mapped_column(String(300))
    cycle_counter: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class SterilisationCycle(TimestampMixin, Base):
    """One run of a steriliser: a load of instruments, or a daily/weekly test."""

    __tablename__ = "sterilisation_cycles"
    __table_args__ = (UniqueConstraint("steriliser_id", "cycle_number", name="uq_cycle_number"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    steriliser_id: Mapped[str] = mapped_column(ForeignKey("sterilisers.id"), nullable=False, index=True)
    cycle_number: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(12), default="load", nullable=False)  # load | bowie_dick | helix | vacuum_test | bi_test
    program: Mapped[str | None] = mapped_column(String(40))  # e.g. "134°C wrapped"
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    temperature_c: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    pressure_bar: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    hold_minutes: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    chemical_indicator_ok: Mapped[bool | None] = mapped_column(Boolean)
    test_ok: Mapped[bool | None] = mapped_column(Boolean)  # Bowie-Dick / helix / vacuum result for test cycles
    # Biological indicator (spore test): none | pending | passed | failed
    bi_status: Mapped[str] = mapped_column(String(8), default="none", nullable=False)
    bi_lot: Mapped[str | None] = mapped_column(String(60))
    bi_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # running | passed | failed
    result: Mapped[str] = mapped_column(String(8), default="running", nullable=False, index=True)
    failure_reason: Mapped[str | None] = mapped_column(String(300))
    printout_document: Mapped[str | None] = mapped_column(String(300))  # optional photo of the printout (storage key)
    operator_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    released_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    notes: Mapped[str | None] = mapped_column(Text)


class InstrumentPack(TimestampMixin, Base):
    """A pouch or cassette with a printed code, traced from the cycle that sterilised it to the patient it was used on."""

    __tablename__ = "instrument_packs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    clinic_id: Mapped[str] = mapped_column(ForeignKey("clinics.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    contents: Mapped[str] = mapped_column(String(120), nullable=False)  # e.g. "Extraction kit"
    cycle_id: Mapped[str] = mapped_column(ForeignKey("sterilisation_cycles.id"), nullable=False, index=True)
    # awaiting_release | sterile | used | expired | recalled | discarded
    status: Mapped[str] = mapped_column(String(18), default="awaiting_release", nullable=False, index=True)
    expires_on: Mapped[date] = mapped_column(Date, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    patient_id: Mapped[str | None] = mapped_column(ForeignKey("patients.id", ondelete="SET NULL"), index=True)
    appointment_id: Mapped[str | None] = mapped_column(ForeignKey("appointments.id", ondelete="SET NULL"))
    used_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    status_note: Mapped[str | None] = mapped_column(String(300))


# ---------------------------------------------------------------------------
# Data protection (DPDP Act): requests from patients about their data
# ---------------------------------------------------------------------------

class DataRequest(TimestampMixin, Base):
    __tablename__ = "data_requests"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    patient_id: Mapped[str | None] = mapped_column(ForeignKey("patients.id", ondelete="SET NULL"), index=True)
    clinic_id: Mapped[str | None] = mapped_column(ForeignKey("clinics.id", ondelete="SET NULL"), index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # access | correction | erasure | withdraw_consent | grievance
    status: Mapped[str] = mapped_column(String(12), default="received", nullable=False, index=True)  # received | in_progress | completed | rejected
    source: Mapped[str] = mapped_column(String(10), default="portal", nullable=False)  # portal | staff
    details: Mapped[str] = mapped_column(Text, default="", nullable=False)
    requester_name: Mapped[str] = mapped_column(String(150), default="", nullable=False)  # kept after anonymisation
    due_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    resolution: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    handled_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
