"""Patient data rights (India's Digital Personal Data Protection Act, 2023): copies of data, corrections,
erasure, withdrawing consent, and a log of who looked at a record.

Health and billing records usually have to be kept for a number of years, so erasure here means
anonymising the person's identity once those periods are over (or earlier, with a recorded reason).
The retention periods are settings: confirm them with your legal adviser.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, inspect as sa_inspect, select
from sqlalchemy.orm import Session

from app.core.database import Base
from app.models import (
    AppSetting, Appointment, AuditLog, ClinicalNote, Family, Invoice, Lead, LeadActivity, MessageLog, Patient, PatientDocument, Payment,
    Recall, User,
)
from app.services import documents as doc_store

DEFAULT_SETTINGS: dict[str, Any] = {
    "clinicalRetentionYears": 3,  # from the last visit; check the rules that apply to your practice
    "billingRetentionYears": 8,  # GST and tax records; check with your CA
    "responseDays": 30,  # target for answering a request
    "logRecordViews": True,
    "grievanceOfficerName": "",
    "grievanceOfficerEmail": "",
    "grievanceOfficerPhone": "",
}
KINDS = ("access", "correction", "erasure", "withdraw_consent", "grievance")
VIEW_THROTTLE = timedelta(minutes=10)
# Never put these in an export: secrets and internal storage paths.
EXCLUDED_COLUMNS = {"password_hash", "token_version", "sign_token_hash", "storage_key", "thumbnail_key", "checkin_token",
                    "lead_token", "dedupe_key", "provider_message_id"}


def settings(db: Session) -> dict[str, Any]:
    row = db.get(AppSetting, "privacy_settings")
    return {**DEFAULT_SETTINGS, **((row.value if row else None) or {})}


def save_settings(db: Session, changes: dict[str, Any]) -> dict[str, Any]:
    current = settings(db)
    current.update({k: v for k, v in changes.items() if k in DEFAULT_SETTINGS and v is not None})
    row = db.get(AppSetting, "privacy_settings")
    if row:
        row.value = current
    else:
        db.add(AppSetting(key="privacy_settings", value=current))
    return current


def due_on(db: Session) -> date:
    return date.today() + timedelta(days=int(settings(db)["responseDays"]))


# ---------------------------------------------------------------------------
# Who looked at a record
# ---------------------------------------------------------------------------

def log_view(db: Session, user: User, patient_id: str, what: str = "record", detail: dict | None = None) -> None:
    """Note that a staff member opened a patient's record (at most once per 10 minutes per person and thing)."""
    if user.role == "patient" or not settings(db)["logRecordViews"]:
        return
    action = "view" if what == "record" else f"view_{what}"
    since = datetime.now(timezone.utc) - VIEW_THROTTLE
    recent = db.scalars(select(AuditLog.id).where(AuditLog.actor_user_id == user.id, AuditLog.action == action,
                                                  AuditLog.entity_type == "patient", AuditLog.entity_id == patient_id,
                                                  AuditLog.timestamp >= since)).first()
    if recent and not detail:
        return
    db.add(AuditLog(actor_user_id=user.id, action=action, entity_type="patient", entity_id=patient_id, after_state=detail))


def access_log(db: Session, patient: Patient, limit: int = 500) -> list[dict[str, Any]]:
    rows = list(db.scalars(select(AuditLog).where(AuditLog.entity_type == "patient", AuditLog.entity_id == patient.id)
                           .order_by(AuditLog.timestamp.desc()).limit(limit)))
    ids = {r.actor_user_id for r in rows if r.actor_user_id}
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(ids))).unique()} if ids else {}
    out = []
    for r in rows:
        u = users.get(r.actor_user_id or "")
        out.append({"id": r.id, "at": r.timestamp, "action": r.action, "userId": r.actor_user_id,
                    "userName": f"{u.first_name} {u.last_name}".strip() if u else ("Patient portal" if r.actor_user_id else "System"),
                    "role": u.role if u else None, "detail": r.after_state if r.action.startswith("view") else None})
    return out


# ---------------------------------------------------------------------------
# Copy of their data
# ---------------------------------------------------------------------------

def _plain(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _row(obj: Any) -> dict[str, Any]:
    mapper = sa_inspect(obj).mapper
    return {c.key: _plain(getattr(obj, c.key)) for c in mapper.column_attrs if c.key not in EXCLUDED_COLUMNS}


def export(db: Session, patient: Patient) -> dict[str, Any]:
    """Everything stored about the patient, grouped by kind. Files are listed; they download separately."""
    data: dict[str, Any] = {
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "about": "Copy of the personal data held by the clinic, as required by the Digital Personal Data Protection Act, 2023.",
        "patient": _row(patient),
    }
    for mapper in sorted(Base.registry.mappers, key=lambda m: m.class_.__tablename__):
        cls = mapper.class_
        if cls is Patient or "patient_id" not in mapper.columns:
            continue
        rows = list(db.scalars(select(cls).where(getattr(cls, "patient_id") == patient.id)))
        if cls is PatientDocument:
            rows = [r for r in rows if r.deleted_at is None]
        if rows:
            data[cls.__tablename__] = [_row(r) for r in rows]
    invoice_ids = [i["id"] for i in data.get("invoices", [])]
    if invoice_ids:
        data["payments"] = [_row(p) for p in db.scalars(select(Payment).where(Payment.invoice_id.in_(invoice_ids)))]
    # Messages sent to the number before the person was a patient (enquiries).
    if patient.phone:
        from app.services.whatsapp import normalise_phone

        digits = normalise_phone(patient.phone)
        if digits:
            extra = list(db.scalars(select(MessageLog).where(MessageLog.phone == digits, MessageLog.patient_id.is_(None))))
            if extra:
                data["messages_before_registration"] = [_row(m) for m in extra]
    data["accessLog"] = [{k: _plain(v) for k, v in r.items()} for r in access_log(db, patient)]
    return data


# ---------------------------------------------------------------------------
# Retention, consent withdrawal and erasure
# ---------------------------------------------------------------------------

def _add_years(d: date, years: int) -> date:
    try:
        return d.replace(year=d.year + years)
    except ValueError:  # 29 Feb
        return d.replace(year=d.year + years, day=28)


def retention(db: Session, patient: Patient) -> dict[str, Any]:
    cfg = settings(db)
    last_visit = db.scalar(select(func.max(Appointment.start_time)).where(Appointment.patient_id == patient.id,
                                                                          Appointment.status.in_(("completed", "in_progress"))))
    last_note = db.scalar(select(func.max(ClinicalNote.created_at)).where(ClinicalNote.patient_id == patient.id))
    last_bill = db.scalar(select(func.max(Invoice.created_at)).where(Invoice.patient_id == patient.id))
    clinical_from = max(filter(None, [d.date() if isinstance(d, datetime) else d for d in (last_visit, last_note)]), default=None)
    billing_from = last_bill.date() if isinstance(last_bill, datetime) else last_bill
    clinical_until = _add_years(clinical_from, int(cfg["clinicalRetentionYears"])) if clinical_from else None
    billing_until = _add_years(billing_from, int(cfg["billingRetentionYears"])) if billing_from else None
    keep_until = max(filter(None, [clinical_until, billing_until]), default=None)
    return {
        "lastClinicalActivity": clinical_from, "lastBill": billing_from,
        "clinicalUntil": clinical_until, "billingUntil": billing_until, "keepUntil": keep_until,
        "canErase": keep_until is None or keep_until <= date.today(),
        "anonymisedAt": patient.anonymised_at,
    }


def withdraw_consent(db: Session, patient: Patient) -> dict[str, int]:
    """Stop all non-essential messages: WhatsApp reminders, recalls, review requests and enquiry follow-ups."""
    prefs = dict(patient.communication_prefs or {})
    prefs.update({"whatsappOptIn": False, "marketing": False, "consentWithdrawnAt": datetime.now(timezone.utc).isoformat()})
    patient.communication_prefs = prefs
    recalls = 0
    for r in db.scalars(select(Recall).where(Recall.patient_id == patient.id, Recall.status.in_(("due", "contacted")))):
        r.status, recalls = "dismissed", recalls + 1
        r.notes = ((r.notes + "\n") if r.notes else "") + "Patient withdrew consent for messages"
    leads = 0
    for lead in db.scalars(select(Lead).where(Lead.patient_id == patient.id, Lead.status.in_(("new", "contacted", "consult_booked", "visited")))):
        lead.status, lead.lost_reason, lead.closed_at, lead.next_follow_up_at = "lost", "not_needed", datetime.now(timezone.utc), None
        leads += 1
    return {"recallsDismissed": recalls, "enquiriesClosed": leads}


def anonymise(db: Session, patient: Patient) -> dict[str, int]:
    """Remove who the patient is. Clinical and billing rows stay (under the anonymous ID) for the law and reports."""
    from app.services.whatsapp import normalise_phone

    digits = normalise_phone(patient.phone)
    withdraw_consent(db, patient)
    files = 0
    for d in db.scalars(select(PatientDocument).where(PatientDocument.patient_id == patient.id)):
        doc_store.remove(d.storage_key)
        doc_store.remove(d.thumbnail_key)
        d.storage_key, d.thumbnail_key = f"erased/{d.id}", None
        d.file_name, d.title, d.notes, d.annotations = "erased", "Erased", None, []
        d.deleted_at = d.deleted_at or datetime.now(timezone.utc)
        files += 1
    messages = 0
    for m in db.scalars(select(MessageLog).where((MessageLog.patient_id == patient.id) |
                                                ((MessageLog.phone == digits) if digits else (MessageLog.id.is_(None))))):
        m.body, m.phone, m.payload, m.error = "[erased]", "", None, None
        messages += 1
    leads = 0
    for lead in db.scalars(select(Lead).where((Lead.patient_id == patient.id) | ((Lead.phone == digits) if digits else Lead.id.is_(None)))):
        for act in db.scalars(select(LeadActivity).where(LeadActivity.lead_id == lead.id)):
            db.delete(act)
        db.delete(lead)
        leads += 1
    for u in db.scalars(select(User).where(User.patient_id == patient.id)).unique():
        u.is_active = False
        u.email = f"erased-{u.id}@invalid.local"
        u.first_name, u.last_name, u.phone, u.avatar_url, u.password_hash = "Erased", "patient", None, None, None
        u.token_version += 1
    if patient.family_id:
        fam = db.get(Family, patient.family_id)
        patient.family_id, patient.family_relation = None, None
        if fam and fam.head_patient_id == patient.id:
            others = list(db.scalars(select(Patient).where(Patient.family_id == fam.id, Patient.id != patient.id)))
            if others:
                fam.head_patient_id = others[0].id
    year = (patient.dob or "")[:4]
    patient.first_name, patient.last_name = "Erased", "patient"
    patient.phone, patient.email = "", None
    patient.dob = f"{year}-01-01" if len(year) == 4 and year.isdigit() else None
    patient.address = patient.emergency_contact = patient.insurance = patient.edit_request = None
    patient.communication_prefs = {"whatsappOptIn": False, "marketing": False}
    patient.tags = ["Anonymised"]
    patient.referral_source = None
    patient.anonymised_at = datetime.now(timezone.utc)
    return {"files": files, "messages": messages, "enquiries": leads}
