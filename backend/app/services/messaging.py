"""Sending WhatsApp messages from templates, logging them, and handling replies."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

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
from app.services import message_i18n as i18n
from app.services.availability import clinic_tz, is_free
from app.services.scheduling import as_utc
from app.services.whatsapp import get_provider, normalise_phone

log = logging.getLogger("dentassist.messaging")

# Default templates. "metaName" must match a template approved in Meta's WhatsApp Manager;
# "body" is the wording to submit for approval (and what the log shows). {{n}} are parameters.
# Hindi and Marathi versions live in message_i18n and are added to each template below.
DEFAULT_TEMPLATES: dict[str, dict[str, Any]] = {
    "appointment_reminder": {
        "label": "Reminder, sent by staff",
        "metaName": "appointment_reminder", "language": "en", "enabled": True,
        "body": "Hi {{1}}, a reminder of your dental appointment at {{2}} on {{3}} at {{4}} with {{5}}. "
                "Reply CONFIRM to confirm, CANCEL to cancel or RESCHEDULE to change the time.",
        "params": ["patient_first_name", "clinic_name", "date", "time", "dentist_name"],
    },
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

for _key, _tpl in DEFAULT_TEMPLATES.items():
    _tpl["translations"] = {lang: {"body": body, "enabled": True}
                            for lang, body in i18n.TEMPLATE_TRANSLATIONS.get(_key, {}).items()}

CONFIRM_WORDS = {"confirm", "confirmed", "yes confirm", "ok", "okay", "1", "👍"} | i18n.CONFIRM_WORDS_LOCAL
CANCEL_WORDS = {"cancel", "cancelled", "cancel it", "2"} | i18n.CANCEL_WORDS_LOCAL
RESCHEDULE_WORDS = {"reschedule", "change", "3"} | i18n.RESCHEDULE_WORDS_LOCAL
YES_WORDS = {"yes", "y", "haan", "ha", "book", "yes please"} | i18n.YES_WORDS_LOCAL
REPLYABLE_KINDS = ["appointment_reminder", "reminder_24h", "reminder_2h", "booking_confirmation", "slot_offer"]


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

def templates(db: Session) -> dict[str, dict[str, Any]]:
    stored = db.get(AppSetting, "whatsapp_templates")
    merged = {k: {**v, "translations": {lang: dict(t) for lang, t in v["translations"].items()}}
              for k, v in DEFAULT_TEMPLATES.items()}
    if stored:
        for key, override in (stored.value or {}).items():
            if key not in merged:
                continue
            merged[key].update({k: v for k, v in override.items() if k in ("metaName", "language", "enabled", "body")})
            for lang, t in (override.get("translations") or {}).items():
                if lang in merged[key]["translations"]:
                    merged[key]["translations"][lang].update(
                        {k: v for k, v in t.items() if k in ("body", "enabled")})
    return merged


def message_language(tpl: dict[str, Any], patient: Patient) -> str:
    """The patient's language if this template has an active version in it, otherwise English."""
    lang = i18n.language_of(patient.communication_prefs)
    t = tpl["translations"].get(lang)
    return lang if t and t.get("enabled", True) and t.get("body") else "en"


def _body(tpl: dict[str, Any], lang: str) -> str:
    return tpl["translations"][lang]["body"] if lang != "en" else tpl["body"]


def _meta_language(tpl: dict[str, Any], lang: str) -> str:
    return tpl.get("language", "en") if lang == "en" else lang


def render(body: str, params: list[str]) -> str:
    out = body
    for i, p in enumerate(params, start=1):
        out = out.replace("{{" + str(i) + "}}", p)
    return out


def _money(amount) -> str:
    return f"₹{float(amount):,.0f}" if float(amount) == int(float(amount)) else f"₹{float(amount):,.2f}"


def _first_name(p: Patient) -> str:
    return (p.first_name or "there").split(" ")[0]


def _when(clinic: Clinic, dt: datetime, lang: str = "en") -> tuple[str, str]:
    local = as_utc(dt).astimezone(clinic_tz(clinic))
    return i18n.day_label(local, lang), local.strftime("%I:%M %p").lstrip("0")


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
    params: list[str] | Callable[[str], list[str]],
    *,
    appointment_id: str | None = None,
    invoice_id: str | None = None,
    payload: dict | None = None,
    dedupe_key: str | None = None,
    actor: User | None = None,
    respect_opt_in: bool = True,
) -> MessageLog | None:
    """Send one template message in the patient's language and log it.

    `params` may be a function of the language code, so dates can be written in that language.
    Returns None if it was already sent (dedupe).
    """
    tpl = templates(db)[key]
    build = params if callable(params) else (lambda _lang: params)
    lang = message_language(tpl, patient)
    values = build(lang)
    phone = normalise_phone(patient.phone)
    row = MessageLog(
        patient_id=patient.id, phone=phone or (patient.phone or "")[:20], direction="outbound", kind=key,
        template_name=tpl["metaName"], body=render(_body(tpl, lang), values), status="queued",
        appointment_id=appointment_id, invoice_id=invoice_id, payload={**(payload or {}), "language": lang},
        dedupe_key=dedupe_key, created_by_id=actor.id if actor else None,
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
        result = provider.send_template(phone, tpl["metaName"], _meta_language(tpl, lang), values, row.body)
        if not result.ok and lang != "en":
            # Most often the translation isn't approved in Meta yet: fall back to English.
            en_values = build("en")
            fallback = provider.send_template(phone, tpl["metaName"], _meta_language(tpl, "en"), en_values,
                                              render(tpl["body"], en_values))
            if fallback.ok:
                log.warning("WhatsApp %s in %s failed (%s); sent in English", key, lang, result.error)
                row.body = render(tpl["body"], en_values)
                row.payload = {**(row.payload or {}), "language": "en", "fallbackFrom": lang}
                result = fallback
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
    def params(lang: str) -> list[str]:
        date_s, time_s = _when(clinic, appt.start_time, lang)
        values = {
            "patient_first_name": _first_name(patient), "clinic_name": clinic.name, "date": date_s, "time": time_s,
            "dentist_name": _dentist(db, appt.dentist_id),
        }
        return [values[p] for p in DEFAULT_TEMPLATES[key]["params"]]

    return send_template(db, patient, key, params, appointment_id=appt.id, actor=actor,
                         dedupe_key=f"{appt.id}:{key}" if dedupe else None)


def invoice_message(db: Session, invoice: Invoice, key: str, actor: User | None = None,
                    amount=None, dedupe_key: str | None = None) -> MessageLog | None:
    patient = db.get(Patient, invoice.patient_id)
    clinic = db.get(Clinic, invoice.clinic_id)
    if not patient or not clinic:
        return None
    link = f"{get_settings().public_app_url.rstrip('/')}/bills"

    def params(lang: str) -> list[str]:
        due = as_utc(invoice.due_date).astimezone(clinic_tz(clinic))
        values = {
            "patient_first_name": _first_name(patient), "invoice_number": invoice.invoice_number,
            "amount": _money(amount if amount is not None else invoice.total), "clinic_name": clinic.name,
            "due_date": i18n.day_label(due, lang, with_weekday=False), "link": link,
        }
        return [values[p] for p in DEFAULT_TEMPLATES[key]["params"]]

    return send_template(db, patient, key, params, invoice_id=invoice.id, actor=actor, dedupe_key=dedupe_key)


def offer_slot(db: Session, appt: Appointment, entry: WaitlistEntry, actor: User | None) -> MessageLog | None:
    patient = db.get(Patient, entry.patient_id)
    clinic = db.get(Clinic, appt.clinic_id)
    def params(lang: str) -> list[str]:
        date_s, time_s = _when(clinic, appt.start_time, lang)
        return [_first_name(patient), _dentist(db, appt.dentist_id), date_s, time_s]

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
                                     MessageLog.kind.in_(REPLYABLE_KINDS),
                                     MessageLog.created_at >= datetime.now(timezone.utc) - timedelta(hours=72))
            .order_by(MessageLog.created_at.desc())
        ).first()
    # Family members often share a number, so prefer the patient the message was sent to.
    patient = (db.get(Patient, source.patient_id) if source and source.patient_id else None) or _find_patient(db, phone)
    db.add(MessageLog(patient_id=patient.id if patient else None, phone=phone, direction="inbound", kind="inbound",
                      body=text[:2000], status="received", provider_message_id=provider_message_id,
                      appointment_id=source.appointment_id if source else None))
    db.flush()

    lang = i18n.language_of(patient.communication_prefs) if patient else "en"
    if source and source.kind == "slot_offer" and word in YES_WORDS | CONFIRM_WORDS:
        return _accept_offer(db, phone, patient, source, lang)

    appt = db.get(Appointment, source.appointment_id) if source and source.appointment_id else None
    if appt and appt.status in ("scheduled", "confirmed") and as_utc(appt.start_time) > datetime.now(timezone.utc):
        clinic = db.get(Clinic, appt.clinic_id)
        date_s, time_s = _when(clinic, appt.start_time, lang)
        desk_date, desk_time = _when(clinic, appt.start_time)
        if word in CONFIRM_WORDS:
            appt.status = "confirmed"
            send_text(db, phone, i18n.reply("confirmed", lang, date=date_s, time=time_s), patient, appt.id)
            return "confirmed"
        if word in CANCEL_WORDS:
            from app.services.waitlist import notify_slot_freed  # avoid import cycle

            appt.status = "cancelled"
            appt.notes = (appt.notes + "\n" if appt.notes else "") + "Cancelled by patient on WhatsApp"
            notify_slot_freed(db, appt)
            _notify_desk(db, appt.clinic_id, "Cancelled on WhatsApp",
                         f"{patient.first_name if patient else phone} cancelled {desk_date} at {desk_time}.")
            send_text(db, phone, i18n.reply("cancelled", lang, date=date_s, time=time_s,
                                            phone=clinic.phone or i18n.reply("the_clinic", lang)), patient, appt.id)
            return "cancelled"
        if word in RESCHEDULE_WORDS:
            _notify_desk(db, appt.clinic_id, "Reschedule request",
                         f"{patient.first_name if patient else phone} wants to move {desk_date} at {desk_time}. Please call them.")
            send_text(db, phone, i18n.reply("reschedule", lang), patient, appt.id)
            return "reschedule_requested"

    # Anything else: make sure a person sees it.
    clinic_id = (appt.clinic_id if appt else None) or (patient.clinic_id if patient else None)
    if clinic_id:
        name = f"{patient.first_name} {patient.last_name}".strip() if patient else f"+{phone}"
        _notify_desk(db, clinic_id, "WhatsApp message", f"{name}: {text[:200]}")
    return "forwarded"


def _accept_offer(db: Session, phone: str, patient: Patient | None, offer: MessageLog, lang: str = "en") -> str:
    data = offer.payload or {}
    entry = db.get(WaitlistEntry, data.get("waitlistEntryId")) if data.get("waitlistEntryId") else None
    clinic = db.get(Clinic, data.get("clinicId")) if data.get("clinicId") else None
    if not (entry and clinic and patient and entry.patient_id == patient.id):
        return "forwarded"
    start = datetime.fromisoformat(data["startTime"])
    end = datetime.fromisoformat(data["endTime"])
    date_s, time_s = _when(clinic, start, lang)
    desk_date, desk_time = _when(clinic, start)
    if entry.status != "waiting" or not is_free(db, clinic, data["dentistId"], start, end):
        send_text(db, phone, i18n.reply("offer_taken", lang, date=date_s, time=time_s), patient)
        return "offer_taken"
    appt = Appointment(patient_id=patient.id, dentist_id=data["dentistId"], clinic_id=clinic.id, start_time=start,
                       end_time=end, status="confirmed", procedure_type=data.get("procedureType") or "Consultation",
                       notes="Booked from waitlist offer on WhatsApp")
    db.add(appt)
    entry.status = "scheduled"
    db.flush()
    _notify_desk(db, clinic.id, "Waitlist slot filled", f"{patient.first_name} {patient.last_name} took {desk_date} at {desk_time}.")
    send_text(db, phone, i18n.reply("offer_accepted", lang, date=date_s, time=time_s,
                                    dentist=_dentist(db, data["dentistId"])), patient, appt.id)
    return "offer_accepted"
