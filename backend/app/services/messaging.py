"""Sending WhatsApp messages from templates, logging them, and handling replies."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import (
    AppSetting,
    Appointment,
    Clinic,
    Invoice,
    MessageLog,
    Notification,
    Patient,
    User,
    WaitlistEntry,
)
from app.services.availability import clinic_tz, is_free
from app.services.scheduling import as_utc
from app.services.whatsapp import get_provider, normalise_phone

log = logging.getLogger("dentassist.messaging")

# Default templates. "metaName" must match a template approved in Meta's WhatsApp Manager;
# "body" is the wording to submit for approval (and what the log shows). {{n}} are parameters.
DEFAULT_TEMPLATES: dict[str, dict[str, Any]] = {
    "reminder_24h": {
        "label": "Reminder, day before",
        "metaName": "appointment_reminder_24h", "language": "en", "enabled": True,
        "body": "Hi {{1}}, a reminder of your dental appointment at {{2}} tomorrow, {{3}} at {{4}} with {{5}}. "
                "Reply CONFIRM to confirm, CANCEL to cancel or RESCHEDULE to change the time.",
        "params": ["patient_first_name", "clinic_name", "date", "time", "dentist_name"],
    },
    "reminder_2h": {
        "label": "Reminder, 2 hours before",
        "metaName": "appointment_reminder_2h", "language": "en", "enabled": True,
        "body": "Hi {{1}}, see you soon! Your appointment with {{2}} is today at {{3}} at {{4}}.",
        "params": ["patient_first_name", "dentist_name", "time", "clinic_name"],
    },
    "booking_confirmation": {
        "label": "Booking confirmation",
        "metaName": "appointment_booked", "language": "en", "enabled": True,
        "body": "Hi {{1}}, your appointment with {{2}} at {{3}} is booked for {{4}} at {{5}}. "
                "Reply CONFIRM to confirm or CANCEL if you can't make it.",
        "params": ["patient_first_name", "dentist_name", "clinic_name", "date", "time"],
    },
    "slot_offer": {
        "label": "Waitlist: earlier slot available",
        "metaName": "waitlist_slot_offer", "language": "en", "enabled": True,
        "body": "Hi {{1}}, an earlier appointment just opened with {{2}} on {{3}} at {{4}}. "
                "Reply YES to take it. First reply gets the slot.",
        "params": ["patient_first_name", "dentist_name", "date", "time"],
    },
    "invoice_issued": {
        "label": "Invoice issued",
        "metaName": "invoice_issued", "language": "en", "enabled": True,
        "body": "Hi {{1}}, your invoice {{2}} for {{3}} from {{4}} is ready, due {{5}}. View and pay: {{6}}",
        "params": ["patient_first_name", "invoice_number", "amount", "clinic_name", "due_date", "link"],
    },
    "payment_receipt": {
        "label": "Payment received",
        "metaName": "payment_received", "language": "en", "enabled": True,
        "body": "Hi {{1}}, thank you! We received {{2}} for invoice {{3}}.",
        "params": ["patient_first_name", "amount", "invoice_number"],
    },
}

CONFIRM_WORDS = {"confirm", "confirmed", "yes confirm", "ok", "okay", "1", "👍"}
CANCEL_WORDS = {"cancel", "cancelled", "cancel it", "2"}
RESCHEDULE_WORDS = {"reschedule", "change", "3"}
YES_WORDS = {"yes", "y", "haan", "ha", "book", "yes please"}


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

def templates(db: Session) -> dict[str, dict[str, Any]]:
    stored = db.get(AppSetting, "whatsapp_templates")
    merged = {k: dict(v) for k, v in DEFAULT_TEMPLATES.items()}
    if stored:
        for key, override in (stored.value or {}).items():
            if key in merged:
                merged[key].update({k: v for k, v in override.items() if k in ("metaName", "language", "enabled", "body")})
    return merged


def render(body: str, params: list[str]) -> str:
    out = body
    for i, p in enumerate(params, start=1):
        out = out.replace("{{" + str(i) + "}}", p)
    return out


def _money(amount) -> str:
    return f"₹{float(amount):,.0f}" if float(amount) == int(float(amount)) else f"₹{float(amount):,.2f}"


def _first_name(p: Patient) -> str:
    return (p.first_name or "there").split(" ")[0]


def _when(clinic: Clinic, dt: datetime) -> tuple[str, str]:
    local = as_utc(dt).astimezone(clinic_tz(clinic))
    return local.strftime("%a %d %b"), local.strftime("%I:%M %p").lstrip("0")


def _dentist(db: Session, user_id: str) -> str:
    u = db.get(User, user_id)
    return f"Dr. {u.first_name} {u.last_name}".strip() if u else "your dentist"


# ---------------------------------------------------------------------------
# Sending
# ---------------------------------------------------------------------------

def opted_in(patient: Patient) -> bool:
    prefs = patient.communication_prefs or {}
    return bool(prefs.get("whatsappOptIn", False))


def send_template(
    db: Session,
    patient: Patient,
    key: str,
    params: list[str],
    *,
    appointment_id: str | None = None,
    invoice_id: str | None = None,
    payload: dict | None = None,
    dedupe_key: str | None = None,
    actor: User | None = None,
    respect_opt_in: bool = True,
) -> MessageLog | None:
    """Send one template message and log it. Returns None if it was already sent (dedupe)."""
    tpl = templates(db)[key]
    phone = normalise_phone(patient.phone)
    row = MessageLog(
        patient_id=patient.id, phone=phone or (patient.phone or "")[:20], direction="outbound", kind=key,
        template_name=tpl["metaName"], body=render(tpl["body"], params), status="queued",
        appointment_id=appointment_id, invoice_id=invoice_id, payload=payload, dedupe_key=dedupe_key,
        created_by_id=actor.id if actor else None,
    )
    # Claim the dedupe key first, so two workers can never send the same reminder.
    if dedupe_key:
        if db.scalars(select(MessageLog.id).where(MessageLog.dedupe_key == dedupe_key)).first():
            return None
        if db.get_bind().dialect.name != "sqlite":
            try:
                with db.begin_nested():
                    db.add(row)
                    db.flush()
            except IntegrityError:
                return None  # another worker sent it a moment ago
    db.add(row)
    db.flush()

    provider = get_provider()
    if not tpl.get("enabled", True):
        row.status, row.error = "skipped", "Template switched off in settings"
    elif respect_opt_in and not opted_in(patient):
        row.status, row.error = "skipped", "Patient has not opted in to WhatsApp"
    elif not phone:
        row.status, row.error = "failed", "No valid mobile number on file"
    elif provider is None:
        row.status, row.error = "skipped", "WhatsApp is not set up"
    else:
        result = provider.send_template(phone, tpl["metaName"], tpl.get("language", "en"), params, row.body)
        row.status = "sent" if result.ok else "failed"
        row.provider_message_id = result.provider_message_id
        row.error = result.error
    return row


def send_text(db: Session, phone: str, text: str, patient: Patient | None = None,
              appointment_id: str | None = None) -> MessageLog:
    provider = get_provider()
    row = MessageLog(patient_id=patient.id if patient else None, phone=phone, direction="outbound", kind="text",
                     body=text, status="queued", appointment_id=appointment_id)
    db.add(row)
    if provider is None:
        row.status, row.error = "skipped", "WhatsApp is not set up"
    else:
        result = provider.send_text(phone, text)
        row.status = "sent" if result.ok else "failed"
        row.provider_message_id, row.error = result.provider_message_id, result.error
    db.flush()
    return row


# ---------------------------------------------------------------------------
# Message builders
# ---------------------------------------------------------------------------

def appointment_message(db: Session, appt: Appointment, key: str, actor: User | None = None,
                        dedupe: bool = True) -> MessageLog | None:
    patient = db.get(Patient, appt.patient_id)
    clinic = db.get(Clinic, appt.clinic_id)
    if not patient or not clinic:
        return None
    date_s, time_s = _when(clinic, appt.start_time)
    values = {
        "patient_first_name": _first_name(patient), "clinic_name": clinic.name, "date": date_s, "time": time_s,
        "dentist_name": _dentist(db, appt.dentist_id),
    }
    params = [values[p] for p in DEFAULT_TEMPLATES[key]["params"]]
    return send_template(db, patient, key, params, appointment_id=appt.id, actor=actor,
                         dedupe_key=f"{appt.id}:{key}" if dedupe else None)


def invoice_message(db: Session, invoice: Invoice, key: str, actor: User | None = None,
                    amount=None, dedupe_key: str | None = None) -> MessageLog | None:
    patient = db.get(Patient, invoice.patient_id)
    clinic = db.get(Clinic, invoice.clinic_id)
    if not patient or not clinic:
        return None
    link = f"{get_settings().public_app_url.rstrip('/')}/bills"
    values = {
        "patient_first_name": _first_name(patient), "invoice_number": invoice.invoice_number,
        "amount": _money(amount if amount is not None else invoice.total), "clinic_name": clinic.name,
        "due_date": as_utc(invoice.due_date).astimezone(clinic_tz(clinic)).strftime("%d %b"), "link": link,
    }
    params = [values[p] for p in DEFAULT_TEMPLATES[key]["params"]]
    return send_template(db, patient, key, params, invoice_id=invoice.id, actor=actor, dedupe_key=dedupe_key)


def offer_slot(db: Session, appt: Appointment, entry: WaitlistEntry, actor: User | None) -> MessageLog | None:
    patient = db.get(Patient, entry.patient_id)
    clinic = db.get(Clinic, appt.clinic_id)
    date_s, time_s = _when(clinic, appt.start_time)
    params = [_first_name(patient), _dentist(db, appt.dentist_id), date_s, time_s]
    return send_template(
        db, patient, "slot_offer", params, appointment_id=appt.id, actor=actor,
        dedupe_key=f"{appt.id}:{appt.start_time.isoformat()}:offer:{entry.id}",
        payload={"waitlistEntryId": entry.id, "dentistId": appt.dentist_id, "clinicId": appt.clinic_id,
                 "startTime": as_utc(appt.start_time).isoformat(), "endTime": as_utc(appt.end_time).isoformat(),
                 "procedureType": appt.procedure_type},
    )


def quietly(fn, *args, **kwargs) -> MessageLog | None:
    """Automatic messages must never break the action that triggered them (a booking, a payment)."""
    try:
        return fn(*args, **kwargs)
    except Exception:  # noqa: BLE001
        log.exception("Automatic WhatsApp message failed")
        return None


# ---------------------------------------------------------------------------
# Reminders job
# ---------------------------------------------------------------------------

def run_due_reminders(db: Session, now: datetime | None = None) -> dict[str, int]:
    """Send 24-hour and 2-hour reminders that are due. Safe to run as often as you like."""
    now = now or datetime.now(timezone.utc)
    windows = {"reminder_24h": (timedelta(hours=23), timedelta(hours=25)),
               "reminder_2h": (timedelta(hours=1, minutes=30), timedelta(hours=2, minutes=30))}
    counts = {"sent": 0, "skipped": 0, "failed": 0}
    for key, (lo, hi) in windows.items():
        appts = db.scalars(select(Appointment).where(
            Appointment.status.in_(["scheduled", "confirmed"]),
            Appointment.start_time >= now + lo, Appointment.start_time < now + hi,
        )).all()
        for appt in appts:
            row = appointment_message(db, appt, key)
            if row is not None:
                counts[row.status if row.status in counts else "skipped"] += 1
    db.commit()
    return counts


# ---------------------------------------------------------------------------
# Incoming messages and status updates
# ---------------------------------------------------------------------------

def _front_desk(db: Session, clinic_id: str) -> list[User]:
    return [
        u for u in db.scalars(select(User).where(User.role.in_(["receptionist", "admin"]), User.is_active.is_(True))).unique()
        if clinic_id in ({u.clinic_id} | set((u.staff_profile.clinic_ids if u.staff_profile else None) or []))
    ]


def _notify_desk(db: Session, clinic_id: str, title: str, message: str) -> None:
    for u in _front_desk(db, clinic_id):
        db.add(Notification(user_id=u.id, title=title, message=message))


def apply_status(db: Session, provider_message_id: str, status: str, error: str | None = None) -> None:
    order = ["queued", "sent", "delivered", "read"]
    row = db.scalars(select(MessageLog).where(MessageLog.provider_message_id == provider_message_id)).first()
    if not row:
        return
    if status == "failed":
        row.status, row.error = "failed", error or "Delivery failed"
    elif status in order and (row.status not in order or order.index(status) > order.index(row.status)):
        row.status = status  # statuses can arrive out of order; never move backwards


def _find_patient(db: Session, phone: str) -> Patient | None:
    for p in db.scalars(select(Patient)):
        if normalise_phone(p.phone) == phone:
            return p
    return None


def handle_incoming(db: Session, phone: str, text: str, provider_message_id: str | None,
                    context_id: str | None = None) -> str:
    """Act on a patient's reply. Returns what we did (for logs and tests)."""
    if provider_message_id and db.scalars(select(MessageLog).where(MessageLog.provider_message_id == provider_message_id)).first():
        return "duplicate"
    word = " ".join(text.strip().lower().split())

    # Which of our messages is this a reply to? (Quoted message first, else the latest one we sent.)
    source = None
    if context_id:
        source = db.scalars(select(MessageLog).where(MessageLog.provider_message_id == context_id,
                                                     MessageLog.phone == phone)).first()
    if source is None:
        source = db.scalars(
            select(MessageLog).where(MessageLog.phone == phone, MessageLog.direction == "outbound",
                                     MessageLog.kind.in_(["reminder_24h", "reminder_2h", "booking_confirmation", "slot_offer"]),
                                     MessageLog.created_at >= datetime.now(timezone.utc) - timedelta(hours=72))
            .order_by(MessageLog.created_at.desc())
        ).first()
    # Family members often share a number, so prefer the patient the message was sent to.
    patient = (db.get(Patient, source.patient_id) if source and source.patient_id else None) or _find_patient(db, phone)
    db.add(MessageLog(patient_id=patient.id if patient else None, phone=phone, direction="inbound", kind="inbound",
                      body=text[:2000], status="received", provider_message_id=provider_message_id,
                      appointment_id=source.appointment_id if source else None))
    db.flush()

    if source and source.kind == "slot_offer" and word in YES_WORDS | CONFIRM_WORDS:
        return _accept_offer(db, phone, patient, source)

    appt = db.get(Appointment, source.appointment_id) if source and source.appointment_id else None
    if appt and appt.status in ("scheduled", "confirmed") and as_utc(appt.start_time) > datetime.now(timezone.utc):
        clinic = db.get(Clinic, appt.clinic_id)
        date_s, time_s = _when(clinic, appt.start_time)
        if word in CONFIRM_WORDS:
            appt.status = "confirmed"
            send_text(db, phone, f"Thank you, your appointment on {date_s} at {time_s} is confirmed.", patient, appt.id)
            return "confirmed"
        if word in CANCEL_WORDS:
            from app.services.waitlist import notify_slot_freed  # avoid import cycle

            appt.status = "cancelled"
            appt.notes = (appt.notes + "\n" if appt.notes else "") + "Cancelled by patient on WhatsApp"
            notify_slot_freed(db, appt)
            _notify_desk(db, appt.clinic_id, "Cancelled on WhatsApp",
                         f"{patient.first_name if patient else phone} cancelled {date_s} at {time_s}.")
            send_text(db, phone, f"Your appointment on {date_s} at {time_s} is cancelled. "
                                 f"Call {clinic.phone or 'the clinic'} or reply here to book again.", patient, appt.id)
            return "cancelled"
        if word in RESCHEDULE_WORDS:
            _notify_desk(db, appt.clinic_id, "Reschedule request",
                         f"{patient.first_name if patient else phone} wants to move {date_s} at {time_s}. Please call them.")
            send_text(db, phone, "No problem. The clinic will call you shortly to find a new time.", patient, appt.id)
            return "reschedule_requested"

    # Anything else: make sure a person sees it.
    clinic_id = (appt.clinic_id if appt else None) or (patient.clinic_id if patient else None)
    if clinic_id:
        name = f"{patient.first_name} {patient.last_name}".strip() if patient else f"+{phone}"
        _notify_desk(db, clinic_id, "WhatsApp message", f"{name}: {text[:200]}")
    return "forwarded"


def _accept_offer(db: Session, phone: str, patient: Patient | None, offer: MessageLog) -> str:
    data = offer.payload or {}
    entry = db.get(WaitlistEntry, data.get("waitlistEntryId")) if data.get("waitlistEntryId") else None
    clinic = db.get(Clinic, data.get("clinicId")) if data.get("clinicId") else None
    if not (entry and clinic and patient and entry.patient_id == patient.id):
        return "forwarded"
    start = datetime.fromisoformat(data["startTime"])
    end = datetime.fromisoformat(data["endTime"])
    date_s, time_s = _when(clinic, start)
    if entry.status != "waiting" or not is_free(db, clinic, data["dentistId"], start, end):
        send_text(db, phone, f"Sorry, the {date_s} {time_s} slot has just been taken. We'll keep you on the waitlist.", patient)
        return "offer_taken"
    appt = Appointment(patient_id=patient.id, dentist_id=data["dentistId"], clinic_id=clinic.id, start_time=start,
                       end_time=end, status="confirmed", procedure_type=data.get("procedureType") or "Consultation",
                       notes="Booked from waitlist offer on WhatsApp")
    db.add(appt)
    entry.status = "scheduled"
    db.flush()
    _notify_desk(db, clinic.id, "Waitlist slot filled", f"{patient.first_name} {patient.last_name} took {date_s} at {time_s}.")
    send_text(db, phone, f"Done! You're booked for {date_s} at {time_s} with {_dentist(db, data['dentistId'])}.", patient, appt.id)
    return "offer_accepted"
