"""Enquiries (leads) from the website, WhatsApp, Instagram, calls and walk-ins, until they become patients.

Pipeline: new -> contacted -> consult_booked -> visited -> won, or lost at any point.
"consult_booked" and "visited" move on their own: when someone with the lead's mobile number is
registered and booked, or their visit is completed. "won" (treatment accepted) and "lost" are set by staff.
"""

from __future__ import annotations

import statistics
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AppSetting, Appointment, Clinic, Invoice, Lead, LeadActivity, MessageLog, Notification, Patient, Payment, User
from app.services import message_i18n as i18n
from app.services import messaging as msg
from app.services.scheduling import as_utc
from app.services.whatsapp import normalise_phone

SOURCES = ("website", "whatsapp", "instagram", "facebook", "google", "practo", "justdial", "referral", "walk_in", "phone", "other")
STATUSES = ("new", "contacted", "consult_booked", "visited", "won", "lost")
OPEN = ("new", "contacted", "consult_booked", "visited")
RANK = {s: i for i, s in enumerate(STATUSES[:-1])}
LOST_REASONS = ("price", "no_response", "chose_another_clinic", "not_needed", "distance", "timing", "wrong_number", "other")
INTERESTS = ("Checkup", "Cleaning", "Tooth pain", "Root canal", "Implants", "Braces / aligners", "Teeth whitening",
             "Crown / bridge", "Dentures", "Wisdom tooth", "Kids dentistry", "Smile makeover", "Other")

DEFAULT_SETTINGS: dict[str, Any] = {
    "autoAcknowledge": True,  # WhatsApp "thank you, we'll call you" to new enquiries who agreed to WhatsApp
    "firstResponseMinutes": 15,  # a new lead shows as overdue if nobody has called within this time
    "followUpDays": 2,  # default gap before the next follow-up after a contact
    "whatsappClinicId": None,  # which clinic gets WhatsApp messages from unknown numbers (needed with several clinics)
}


def settings(db: Session) -> dict[str, Any]:
    row = db.get(AppSetting, "lead_settings")
    return {**DEFAULT_SETTINGS, **((row.value if row else None) or {})}


def save_settings(db: Session, changes: dict[str, Any]) -> dict[str, Any]:
    current = settings(db)
    for k, v in changes.items():
        if k in DEFAULT_SETTINGS and (v is not None or k == "whatsappClinicId"):
            current[k] = v
    row = db.get(AppSetting, "lead_settings")
    if row:
        row.value = current
    else:
        db.add(AppSetting(key="lead_settings", value=current))
    return current


def _now() -> datetime:
    return datetime.now(timezone.utc)


def first_name(lead: Lead) -> str:
    return (lead.name or "").split(" ")[0] or "there"


def split_name(name: str) -> tuple[str, str]:
    parts = (name or "").strip().split(" ", 1)
    return parts[0], (parts[1].strip() if len(parts) > 1 else "")


def add_activity(db: Session, lead: Lead, kind: str, body: str = "", actor: User | None = None,
                 outcome: str | None = None, data: dict | None = None) -> LeadActivity:
    row = LeadActivity(lead_id=lead.id, kind=kind, body=body[:4000], outcome=outcome, data=data,
                       created_by_id=actor.id if actor else None)
    db.add(row)
    return row


def find_open(db: Session, clinic_id: str, phone: str) -> Lead | None:
    return db.scalars(select(Lead).where(Lead.clinic_id == clinic_id, Lead.phone == phone, Lead.status.in_(OPEN))
                      .order_by(Lead.created_at.desc())).first()


def _patient_by_phone(db: Session, clinic_id: str, phone: str) -> Patient | None:
    for p in db.scalars(select(Patient).where((Patient.clinic_id == clinic_id) | Patient.clinic_id.is_(None))):
        if normalise_phone(p.phone) == phone:
            return p
    return None


def _notify(db: Session, lead: Lead, title: str, message: str) -> None:
    if lead.assigned_to_id:
        db.add(Notification(user_id=lead.assigned_to_id, title=title, message=message))
    else:
        msg._notify_desk(db, lead.clinic_id, title, message)


# ---------------------------------------------------------------------------
# Capture
# ---------------------------------------------------------------------------

def capture(db: Session, clinic: Clinic, *, name: str, phone: str, source: str, email: str | None = None,
            interest: str | None = None, message: str | None = None, language: str = "en",
            whatsapp_consent: bool = False, campaign: dict | None = None, estimated_value: Decimal | None = None,
            assigned_to_id: str | None = None, referred_by_patient_id: str | None = None,
            actor: User | None = None, acknowledge: bool = True) -> tuple[Lead, bool]:
    """Create a lead, or add to the open one for the same number. Returns (lead, merged)."""
    digits = normalise_phone(phone)
    if not digits:
        raise ValueError("phone")
    source = source if source in SOURCES else "other"
    existing = find_open(db, clinic.id, digits)
    if existing:
        add_activity(db, existing, "enquired_again", message or f"Enquired again via {source.replace('_', ' ')}",
                     actor, data={"source": source, "interest": interest})
        existing.interest = existing.interest or interest
        existing.email = existing.email or email
        existing.whatsapp_consent = existing.whatsapp_consent or whatsapp_consent
        if existing.status in ("new", "contacted"):
            existing.next_follow_up_at = min(filter(None, [as_utc(existing.next_follow_up_at) if existing.next_follow_up_at else None,
                                                           _now() + timedelta(minutes=settings(db)["firstResponseMinutes"])]))
            existing.follow_up_notified_at = None
        _notify(db, existing, "Enquired again", f"{existing.name} (+{digits}) enquired again: {(message or interest or '')[:120]}")
        return existing, True

    cfg = settings(db)
    patient = _patient_by_phone(db, clinic.id, digits)
    lead = Lead(clinic_id=clinic.id, name=name.strip()[:150] or f"+{digits}", phone=digits, email=email,
                source=source, interest=interest, message=message, language=language if language in i18n.SUPPORTED else "en",
                whatsapp_consent=whatsapp_consent, campaign=campaign or None, estimated_value=estimated_value,
                assigned_to_id=assigned_to_id, referred_by_patient_id=referred_by_patient_id,
                patient_id=patient.id if patient else None,
                next_follow_up_at=_now() + timedelta(minutes=cfg["firstResponseMinutes"]),
                created_by_id=actor.id if actor else None)
    db.add(lead)
    db.flush()
    add_activity(db, lead, "created", message or "", actor, data={"source": source, "interest": interest,
                                                                  "existingPatient": bool(patient)})
    if source not in ("walk_in",):
        _notify(db, lead, "New enquiry", f"{lead.name} (+{digits}) via {source.replace('_', ' ')}"
                + (f": {interest}" if interest else "") + ". Please call them back.")
    if acknowledge and cfg["autoAcknowledge"] and whatsapp_consent and source != "walk_in":
        msg.quietly(send, db, lead, "lead_ack", actor=None, count_as_contact=False)
    return lead, False


def _recipient(lead: Lead) -> SimpleNamespace:
    """What send_template needs from a patient, built from the lead."""
    return SimpleNamespace(id=None, phone=lead.phone, first_name=first_name(lead), last_name="",
                           communication_prefs={"whatsappOptIn": lead.whatsapp_consent,
                                                "language": i18n.LANGUAGE_NAMES.get(lead.language, "English")})


def booking_link(clinic: Clinic) -> str:
    from app.services.recalls import booking_link as link

    return link(clinic)


def send(db: Session, lead: Lead, key: str, actor: User | None = None, count_as_contact: bool = True) -> MessageLog | None:
    clinic = db.get(Clinic, lead.clinic_id)
    if not clinic:
        return None
    link = booking_link(clinic)
    if key == "lead_ack":
        params = [first_name(lead), clinic.name, link]
        dedupe = f"lead:{lead.id}:ack"
    else:
        params = [first_name(lead), clinic.name, (lead.interest or "dental treatment").lower(), link]
        dedupe = None
    row = msg.send_template(db, _recipient(lead), key, params, payload={"leadId": lead.id, "clinicId": clinic.id},
                            dedupe_key=dedupe, actor=actor)
    if row is None:
        return None
    add_activity(db, lead, "whatsapp", row.body if row.status == "sent" else f"Not sent: {row.error}", actor,
                 data={"template": key, "status": row.status, "messageId": row.id})
    if row.status == "sent" and count_as_contact:
        record_contact(db, lead, actor)
    return row


def record_contact(db: Session, lead: Lead, actor: User | None, next_follow_up_at: datetime | None = None) -> None:
    now = _now()
    lead.contact_count += 1
    lead.first_contacted_at = lead.first_contacted_at or now
    lead.last_contacted_at = now
    if lead.status == "new":
        set_status(db, lead, "contacted", actor)
    if lead.status in OPEN:
        lead.next_follow_up_at = next_follow_up_at or (
            now + timedelta(days=settings(db)["followUpDays"]) if lead.status in ("new", "contacted") else None)
        lead.follow_up_notified_at = None


def set_status(db: Session, lead: Lead, status: str, actor: User | None, lost_reason: str | None = None,
               note: str | None = None) -> None:
    if status == lead.status and (status != "lost" or lost_reason == lead.lost_reason):
        return
    before = lead.status
    lead.status = status
    if status in ("won", "lost"):
        lead.closed_at = _now()
        lead.next_follow_up_at = None
        lead.lost_reason = lost_reason if status == "lost" else None
    else:
        lead.closed_at = None
        lead.lost_reason = None
    if status == "won" and not lead.converted_at and lead.patient_id:
        lead.converted_at = _now()
    label = status.replace("_", " ")
    add_activity(db, lead, "status", (f"{before.replace('_', ' ')} → {label}"
                                      + (f" ({lost_reason.replace('_', ' ')})" if lost_reason else "")
                                      + (f": {note}" if note else "")), actor, data={"from": before, "to": status})


def convert(db: Session, lead: Lead, actor: User, patient: Patient | None = None) -> Patient:
    """Register the lead as a patient (or link the existing record)."""
    if patient is None:
        patient = (db.get(Patient, lead.patient_id) if lead.patient_id else None) or _patient_by_phone(db, lead.clinic_id, lead.phone)
    if patient is None:
        first, last = split_name(lead.name)
        patient = Patient(clinic_id=lead.clinic_id, first_name=first, last_name=last, phone=f"+{lead.phone}",
                          email=lead.email, referral_source=lead.source.replace("_", " ").title(),
                          communication_prefs={"whatsappOptIn": lead.whatsapp_consent,
                                               "language": i18n.LANGUAGE_NAMES.get(lead.language, "English")},
                          tags=["From enquiry"])
        db.add(patient)
        db.flush()
        add_activity(db, lead, "converted", f"Registered as patient {patient.first_name} {patient.last_name}".strip(), actor,
                     data={"patientId": patient.id, "new": True})
    else:
        add_activity(db, lead, "converted", f"Linked to patient {patient.first_name} {patient.last_name}".strip(), actor,
                     data={"patientId": patient.id, "new": False})
    lead.patient_id = patient.id
    lead.converted_at = lead.converted_at or _now()
    return patient


# ---------------------------------------------------------------------------
# Progress from appointments
# ---------------------------------------------------------------------------

def sync_progress(db: Session, leads: list[Lead]) -> int:
    """Link open leads to patients by mobile number and move them on when that patient books or visits."""
    changed = 0
    for lead in leads:
        if lead.status not in OPEN:
            continue
        if not lead.patient_id:
            p = _patient_by_phone(db, lead.clinic_id, lead.phone)
            if p:
                lead.patient_id = p.id
                lead.converted_at = lead.converted_at or _now()
                add_activity(db, lead, "converted", f"Matched to patient {p.first_name} {p.last_name}".strip(),
                             data={"patientId": p.id, "auto": True})
                changed += 1
        if not lead.patient_id:
            continue
        since = as_utc(lead.created_at) - timedelta(hours=1)
        appts = [a for a in db.scalars(select(Appointment).where(Appointment.patient_id == lead.patient_id))
                 if as_utc(a.created_at or a.start_time) >= since or as_utc(a.start_time) >= since]
        target, appt = None, None
        done = [a for a in appts if a.status == "completed"]
        upcoming = [a for a in appts if a.status in ("scheduled", "confirmed", "in_progress")]
        if done:
            target, appt = "visited", min(done, key=lambda a: a.start_time)
        elif upcoming:
            target, appt = "consult_booked", min(upcoming, key=lambda a: a.start_time)
        if target and RANK[target] > RANK[lead.status]:
            set_status(db, lead, target, None)
            lead.appointment_id = appt.id
            lead.next_follow_up_at = None if target == "consult_booked" else _now() + timedelta(days=settings(db)["followUpDays"])
            lead.follow_up_notified_at = None
            changed += 1
    return changed


def run_follow_up_alerts(db: Session, now: datetime | None = None) -> int:
    """Remind whoever owns a lead when its follow-up time comes (once per follow-up)."""
    now = now or _now()
    open_leads = list(db.scalars(select(Lead).where(Lead.status.in_(OPEN))))
    sync_progress(db, open_leads)
    sent = 0
    for lead in open_leads:
        if lead.status not in OPEN or not lead.next_follow_up_at or as_utc(lead.next_follow_up_at) > now:
            continue
        if lead.follow_up_notified_at and as_utc(lead.follow_up_notified_at) >= as_utc(lead.next_follow_up_at):
            continue
        what = "Call back new enquiry" if lead.status == "new" else "Follow up enquiry"
        _notify(db, lead, what, f"{lead.name} (+{lead.phone})" + (f", {lead.interest}" if lead.interest else ""))
        lead.follow_up_notified_at = now
        sent += 1
    db.commit()
    return sent


# ---------------------------------------------------------------------------
# WhatsApp from unknown numbers, and replies to our enquiry messages
# ---------------------------------------------------------------------------

def whatsapp_clinic(db: Session) -> Clinic | None:
    cid = settings(db).get("whatsappClinicId")
    if cid:
        clinic = db.get(Clinic, cid)
        if clinic and clinic.status == "active":
            return clinic
    active = list(db.scalars(select(Clinic).where(Clinic.status == "active")))
    return active[0] if len(active) == 1 else None


def handle_whatsapp(db: Session, phone: str, text: str, wants_booking: bool, source: MessageLog | None) -> str | None:
    lead = None
    if source is not None and (source.payload or {}).get("leadId"):
        lead = db.get(Lead, source.payload["leadId"])
    if lead is None:
        lead = db.scalars(select(Lead).where(Lead.phone == phone, Lead.status.in_(OPEN)).order_by(Lead.created_at.desc())).first()
    if lead is not None:
        add_activity(db, lead, "whatsapp", f"Replied: {text[:1000]}", data={"direction": "inbound"})
        lead.whatsapp_consent = True  # they messaged us
        if wants_booking:
            _notify(db, lead, "Enquiry: wants to book", f"{lead.name} (+{phone}) replied BOOK. Please call to fix a time.")
            msg.send_text(db, phone, i18n.reply("recall_book", lead.language))
            return "lead_book_requested"
        _notify(db, lead, "Enquiry replied", f"{lead.name}: {text[:200]}")
        return "lead_replied"
    if source is not None:
        return None
    clinic = whatsapp_clinic(db)
    if clinic is None:
        return None
    lead, _ = capture(db, clinic, name=f"+{phone}", phone=phone, source="whatsapp", message=text[:2000],
                      whatsapp_consent=True, acknowledge=False)
    msg.send_text(db, phone, i18n.reply("lead_thanks", "en"))
    return "lead_captured"


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

def revenue_by_lead(db: Session, leads: list[Lead]) -> dict[str, Decimal]:
    """Payments from each converted lead's patient since they enquired."""
    out: dict[str, Decimal] = {}
    for lead in leads:
        if not lead.patient_id:
            continue
        total = db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).join(Invoice, Invoice.id == Payment.invoice_id)
                          .where(Invoice.patient_id == lead.patient_id, Payment.paid_at >= lead.created_at))
        if total:
            out[lead.id] = Decimal(total)
    return out


def summary(db: Session, clinic_ids: set[str] | None, start: datetime, end: datetime) -> dict[str, Any]:
    q = select(Lead).where(Lead.created_at >= start, Lead.created_at < end)
    if clinic_ids is not None:
        q = q.where(Lead.clinic_id.in_(clinic_ids))
    leads = list(db.scalars(q))
    revenue = revenue_by_lead(db, leads)

    def booked(lead: Lead) -> bool:
        return lead.appointment_id is not None or lead.status in ("consult_booked", "visited", "won")

    by_source: dict[str, dict[str, Any]] = {}
    for lead in leads:
        row = by_source.setdefault(lead.source, {"source": lead.source, "leads": 0, "booked": 0, "won": 0, "lost": 0, "revenue": Decimal(0)})
        row["leads"] += 1
        row["booked"] += booked(lead)
        row["won"] += lead.status == "won"
        row["lost"] += lead.status == "lost"
        row["revenue"] += revenue.get(lead.id, Decimal(0))
    for row in by_source.values():
        row["bookingRate"] = round(row["booked"] / row["leads"], 3) if row["leads"] else 0
    minutes = [(as_utc(lead.first_contacted_at) - as_utc(lead.created_at)).total_seconds() / 60
               for lead in leads if lead.first_contacted_at]

    open_q = select(Lead).where(Lead.status.in_(OPEN))
    if clinic_ids is not None:
        open_q = open_q.where(Lead.clinic_id.in_(clinic_ids))
    open_leads = list(db.scalars(open_q))
    now = _now()
    lost_reasons: dict[str, int] = {}
    for lead in leads:
        if lead.status == "lost" and lead.lost_reason:
            lost_reasons[lead.lost_reason] = lost_reasons.get(lead.lost_reason, 0) + 1
    return {
        "total": len(leads),
        "byStatus": {s: sum(1 for x in leads if x.status == s) for s in STATUSES},
        "booked": sum(1 for x in leads if booked(x)),
        "won": sum(1 for x in leads if x.status == "won"),
        "bookingRate": round(sum(1 for x in leads if booked(x)) / len(leads), 3) if leads else 0,
        "revenue": sum(revenue.values(), Decimal(0)),
        "medianFirstResponseMinutes": round(statistics.median(minutes)) if minutes else None,
        "uncontacted": sum(1 for x in open_leads if x.status == "new"),
        "overdue": sum(1 for x in open_leads if x.next_follow_up_at and as_utc(x.next_follow_up_at) <= now),
        "openValue": sum((x.estimated_value or Decimal(0)) for x in open_leads),
        "bySource": sorted(by_source.values(), key=lambda r: -r["leads"]),
        "lostReasons": [{"reason": k, "count": v} for k, v in sorted(lost_reasons.items(), key=lambda kv: -kv[1])],
    }
