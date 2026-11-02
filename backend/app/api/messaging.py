"""WhatsApp: status, templates, message log, manual sends and the Meta webhook."""

import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import DbSession, StaffUser, accessible_clinic_ids, require_roles
from app.core.errors import AppError, bad_request, forbidden, not_found
from app.models import AppSetting, Appointment, Invoice, MessageLog, Patient, User, WaitlistEntry
from app.schemas import CamelModel
from app.services import audit
from app.services import messaging as msg
from app.services.scheduling import as_utc
from app.services.whatsapp import get_provider, normalise_phone, verify_signature

log = logging.getLogger("dentassist.messaging")
router = APIRouter(tags=["messaging"])
Admins = Depends(require_roles("super_admin", "admin"))
FrontDesk = Depends(require_roles("super_admin", "admin", "receptionist", "dentist"))


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class MessagingStatusOut(CamelModel):
    provider: str
    ready: bool
    live: bool
    reminders_enabled: bool
    phone_number_id: str | None = None
    detail: str


class TranslationOut(CamelModel):
    body: str
    enabled: bool


class TemplateOut(CamelModel):
    key: str
    label: str
    meta_name: str
    language: str
    enabled: bool
    body: str
    params: list[str]
    # Hindi ("hi") and Marathi ("mr") versions, used for patients who chose that language.
    translations: dict[str, TranslationOut] = {}


class TranslationUpdate(CamelModel):
    body: str | None = Field(default=None, min_length=1, max_length=1024)
    enabled: bool | None = None


class TemplateUpdate(CamelModel):
    meta_name: str | None = Field(default=None, min_length=1, max_length=100, pattern=r"^[a-z0-9_]+$")
    language: str | None = Field(default=None, min_length=2, max_length=10)
    enabled: bool | None = None
    body: str | None = Field(default=None, min_length=1, max_length=1024)
    translations: dict[str, TranslationUpdate] | None = None


class MessageOut(CamelModel):
    id: str
    patient_id: str | None
    patient_name: str | None = None
    phone: str
    direction: str
    kind: str
    template_name: str | None
    body: str
    status: str
    error: str | None
    provider_message_id: str | None = None
    appointment_id: str | None
    invoice_id: str | None
    language: str | None = None
    created_at: datetime
    updated_at: datetime


class OfferRequest(CamelModel):
    entry_ids: list[str] = Field(min_length=1, max_length=10)


class ReplyIn(CamelModel):
    phone: str = Field(min_length=8, max_length=20)
    text: str = Field(min_length=1, max_length=1000)


class TestMessageIn(CamelModel):
    phone: str = Field(min_length=8, max_length=20)


class SendResultOut(CamelModel):
    status: str
    message: MessageOut | None = None
    detail: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _out(db: Session, row: MessageLog, names: dict[str, str] | None = None) -> MessageOut:
    name = None
    if row.patient_id:
        if names is not None and row.patient_id in names:
            name = names[row.patient_id]
        else:
            p = db.get(Patient, row.patient_id)
            name = f"{p.first_name} {p.last_name}".strip() if p else None
    data = MessageOut.model_validate(row)
    data.patient_name = name
    data.language = (row.payload or {}).get("language") if row.direction == "outbound" else None
    return data


def _result(db: Session, row: MessageLog | None, already: str = "Already sent") -> SendResultOut:
    if row is None:
        return SendResultOut(status="duplicate", detail=already)
    detail = {"sent": "Sent on WhatsApp", "skipped": row.error or "Not sent", "failed": row.error or "Sending failed"}
    return SendResultOut(status=row.status, message=_out(db, row), detail=detail.get(row.status, row.status))


def _appointment(db: Session, user: User, appointment_id: str) -> Appointment:
    appt = db.get(Appointment, appointment_id)
    allowed = accessible_clinic_ids(user)
    if not appt or (allowed is not None and appt.clinic_id not in allowed):
        raise not_found("Appointment")
    return appt


# ---------------------------------------------------------------------------
# Status and templates
# ---------------------------------------------------------------------------

@router.get("/messaging/status", response_model=MessagingStatusOut)
def status(user: StaffUser):
    s = get_settings()
    provider = get_provider()
    if s.whatsapp_provider == "meta" and not s.whatsapp_ready:
        detail = "Meta WhatsApp is selected but the access token or phone number ID is missing."
    elif s.whatsapp_provider == "meta":
        detail = "Connected to the WhatsApp Cloud API. Messages go to patients' phones."
    elif s.whatsapp_provider == "console":
        detail = "Test mode: messages are logged here and in the server log, not sent to phones."
    else:
        detail = "WhatsApp is switched off."
    return MessagingStatusOut(
        provider=s.whatsapp_provider, ready=provider is not None, live=s.whatsapp_provider == "meta" and s.whatsapp_ready,
        reminders_enabled=s.reminders_enabled,
        phone_number_id=s.whatsapp_phone_number_id if user.role in ("super_admin", "admin") else None, detail=detail,
    )


def _template_out(key: str, t: dict) -> TemplateOut:
    return TemplateOut(key=key, label=t["label"], meta_name=t["metaName"], language=t["language"], enabled=t["enabled"],
                       body=t["body"], params=t["params"],
                       translations={lang: TranslationOut(**tr) for lang, tr in t["translations"].items()})


def _check_placeholders(key: str, text: str, field: str) -> None:
    expected = len(msg.DEFAULT_TEMPLATES[key]["params"])
    missing = [i for i in range(1, expected + 1) if "{{" + str(i) + "}}" not in text]
    if missing:
        raise AppError(400, f"The message must keep the placeholders {', '.join('{{%d}}' % i for i in missing)}",
                       "TEMPLATE_PLACEHOLDERS", {field: "Missing placeholders"})


@router.get("/messaging/templates", response_model=list[TemplateOut])
def list_templates(db: DbSession, user: StaffUser):
    return [_template_out(k, t) for k, t in msg.templates(db).items()]


@router.put("/messaging/templates/{key}", response_model=TemplateOut)
def update_template(key: str, body: TemplateUpdate, db: DbSession, user: User = Admins):
    if key not in msg.DEFAULT_TEMPLATES:
        raise not_found("Template")
    if body.body is not None:
        _check_placeholders(key, body.body, "body")
    known = msg.DEFAULT_TEMPLATES[key]["translations"]
    for lang, tr in (body.translations or {}).items():
        if lang not in known:
            raise bad_request(f"No {lang} version for this message", "UNKNOWN_LANGUAGE")
        if tr.body is not None:
            _check_placeholders(key, tr.body, f"translations.{lang}.body")
    row = db.get(AppSetting, "whatsapp_templates")
    current = dict(row.value) if row else {}
    override = dict(current.get(key, {}))
    override.update({k: v for k, v in {"metaName": body.meta_name, "language": body.language, "enabled": body.enabled,
                                       "body": body.body}.items() if v is not None})
    if body.translations:
        translations = {lang: dict(t) for lang, t in (override.get("translations") or {}).items()}
        for lang, tr in body.translations.items():
            translations.setdefault(lang, {}).update(
                {k: v for k, v in {"body": tr.body, "enabled": tr.enabled}.items() if v is not None})
        override["translations"] = translations
    current[key] = override
    if row:
        row.value = current
    else:
        db.add(AppSetting(key="whatsapp_templates", value=current))
    audit.record(db, user, "update", "whatsapp_template", key, after=override)
    db.commit()
    return _template_out(key, msg.templates(db)[key])


# ---------------------------------------------------------------------------
# Message log
# ---------------------------------------------------------------------------

@router.get("/messaging/log", response_model=list[MessageOut])
def message_log(
    db: DbSession,
    user: StaffUser,
    patient_id: str | None = Query(default=None, alias="patientId"),
    status_filter: str | None = Query(default=None, alias="status"),
    direction: str | None = None,
    q: str | None = None,
    limit: int = 200,
):
    query = select(MessageLog).order_by(MessageLog.created_at.desc())
    allowed = accessible_clinic_ids(user)
    if allowed is not None:
        clinic_patients = select(Patient.id).where(Patient.clinic_id.in_(allowed))
        clinic_appts = select(Appointment.id).where(Appointment.clinic_id.in_(allowed))
        query = query.where(or_(MessageLog.patient_id.in_(clinic_patients), MessageLog.appointment_id.in_(clinic_appts)))
    if patient_id:
        query = query.where(MessageLog.patient_id == patient_id)
    if status_filter:
        query = query.where(MessageLog.status.in_(status_filter.split(",")))
    if direction in ("inbound", "outbound"):
        query = query.where(MessageLog.direction == direction)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(MessageLog.body.ilike(like), MessageLog.phone.like(like)))
    rows = db.scalars(query.limit(min(max(limit, 1), 500))).all()
    ids = {r.patient_id for r in rows if r.patient_id}
    names = {p.id: f"{p.first_name} {p.last_name}".strip()
             for p in db.scalars(select(Patient).where(Patient.id.in_(ids)))} if ids else {}
    return [_out(db, r, names) for r in rows]


# ---------------------------------------------------------------------------
# Manual sends
# ---------------------------------------------------------------------------

@router.post("/appointments/{appointment_id}/remind", response_model=SendResultOut)
def remind_now(appointment_id: str, db: DbSession, user: User = FrontDesk):
    appt = _appointment(db, user, appointment_id)
    if appt.status not in ("scheduled", "confirmed"):
        raise bad_request("Only upcoming appointments can be reminded", "APPOINTMENT_NOT_UPCOMING")
    if as_utc(appt.start_time) <= datetime.now(as_utc(appt.start_time).tzinfo):
        raise bad_request("This appointment has already started", "APPOINTMENT_PAST")
    row = msg.appointment_message(db, appt, "appointment_reminder", actor=user, dedupe=False)
    db.commit()
    return _result(db, row)


@router.post("/appointments/{appointment_id}/offer-to-waitlist", response_model=list[SendResultOut])
def offer_to_waitlist(appointment_id: str, body: OfferRequest, db: DbSession, user: User = FrontDesk):
    """Offer a freed slot to waitlist patients on WhatsApp. The first to reply YES gets it."""
    appt = _appointment(db, user, appointment_id)
    if as_utc(appt.start_time) <= datetime.now(as_utc(appt.start_time).tzinfo):
        raise bad_request("This slot is in the past", "APPOINTMENT_PAST")
    out = []
    for entry_id in body.entry_ids:
        entry = db.get(WaitlistEntry, entry_id)
        if not entry or entry.clinic_id != appt.clinic_id or entry.status != "waiting":
            out.append(SendResultOut(status="skipped", detail="No longer on the waitlist"))
            continue
        out.append(_result(db, msg.offer_slot(db, appt, entry, user), "Already offered this slot"))
    db.commit()
    return out


@router.post("/invoices/{invoice_id}/whatsapp", response_model=SendResultOut)
def send_invoice_whatsapp(invoice_id: str, db: DbSession,
                          user: User = Depends(require_roles("super_admin", "admin", "receptionist"))):
    inv = db.get(Invoice, invoice_id)
    allowed = accessible_clinic_ids(user)
    if not inv or (allowed is not None and inv.clinic_id not in allowed):
        raise not_found("Invoice")
    if inv.status in ("Draft", "Void"):
        raise bad_request("Issue the invoice before sending it", "INVOICE_NOT_ISSUED")
    row = msg.invoice_message(db, inv, "invoice_issued", actor=user)
    db.commit()
    return _result(db, row)


@router.post("/messaging/reply", response_model=SendResultOut)
def reply(body: ReplyIn, db: DbSession, user: User = FrontDesk):
    """Free-text reply to a patient. WhatsApp only allows this within 24 hours of their last message."""
    phone = normalise_phone(body.phone)
    if not phone:
        raise AppError(400, "Enter a valid mobile number", "INVALID_PHONE", {"phone": "Invalid number"})
    last_in = db.scalars(select(MessageLog).where(MessageLog.phone == phone, MessageLog.direction == "inbound")
                         .order_by(MessageLog.created_at.desc())).first()
    if not last_in or as_utc(last_in.created_at) < datetime.now(timezone.utc) - timedelta(hours=24):
        raise AppError(409, "WhatsApp only allows free replies within 24 hours of the patient's last message. "
                            "Send a reminder or invoice template instead.", "OUTSIDE_REPLY_WINDOW")
    patient = db.get(Patient, last_in.patient_id) if last_in.patient_id else None
    allowed = accessible_clinic_ids(user)
    if allowed is not None and not (patient and patient.clinic_id in allowed):
        raise not_found("Conversation")
    row = msg.send_text(db, phone, body.text.strip(), patient)
    row.created_by_id = user.id
    db.commit()
    return _result(db, row)


@router.post("/messaging/test", response_model=SendResultOut)
def send_test(body: TestMessageIn, db: DbSession, user: User = Admins):
    """Send Meta's built-in 'hello_world' template to check the connection."""
    phone = normalise_phone(body.phone)
    if not phone:
        raise AppError(400, "Enter a valid mobile number", "INVALID_PHONE", {"phone": "Invalid number"})
    provider = get_provider()
    if provider is None:
        return SendResultOut(status="skipped", detail="WhatsApp is not set up")
    result = provider.send_template(phone, "hello_world", "en_US", [], "Hello World (test message)")
    row = MessageLog(phone=phone, direction="outbound", kind="test", template_name="hello_world",
                     body="Hello World (test message)", status="sent" if result.ok else "failed",
                     provider_message_id=result.provider_message_id, error=result.error, created_by_id=user.id)
    db.add(row)
    db.commit()
    return _result(db, row)


@router.post("/messaging/reminders/run")
def run_reminders(db: DbSession, user: User = Admins):
    """Send any due reminders now (the background job does this every few minutes)."""
    if user.role != "super_admin":
        raise forbidden("Only the platform admin can run the reminder job")
    return msg.run_due_reminders(db)


# ---------------------------------------------------------------------------
# Meta webhook
# ---------------------------------------------------------------------------

@router.get("/webhooks/whatsapp", response_class=PlainTextResponse)
def verify_webhook(
    mode: str | None = Query(default=None, alias="hub.mode"),
    token: str | None = Query(default=None, alias="hub.verify_token"),
    challenge: str | None = Query(default=None, alias="hub.challenge"),
):
    """Meta calls this once when you register the webhook URL."""
    expected = get_settings().whatsapp_verify_token
    if mode == "subscribe" and expected and token == expected and challenge:
        return challenge
    raise forbidden("Verification failed")


def _text_of(message: dict) -> str:
    kind = message.get("type")
    if kind == "text":
        return (message.get("text") or {}).get("body", "")
    if kind == "button":
        b = message.get("button") or {}
        return b.get("payload") or b.get("text", "")
    if kind == "interactive":
        i = message.get("interactive") or {}
        reply = i.get("button_reply") or i.get("list_reply") or {}
        return reply.get("id") or reply.get("title", "")
    return f"[{kind or 'message'}]"


@router.post("/webhooks/whatsapp")
@router.post("/webhooks/whatsapp/status", include_in_schema=False)
@router.post("/webhooks/whatsapp/inbound", include_in_schema=False)
async def whatsapp_webhook(request: Request, db: DbSession):
    """Delivery statuses and patient replies from the WhatsApp Cloud API.

    The body is checked against X-Hub-Signature-256 before anything is trusted. Meta retries
    deliveries, so everything here is idempotent.
    """
    raw = await request.body()
    if not verify_signature(raw, request.headers.get("X-Hub-Signature-256")):
        raise AppError(401, "Invalid signature", "INVALID_SIGNATURE")
    try:
        event = json.loads(raw or b"{}")
    except ValueError:
        raise bad_request("Invalid JSON", "INVALID_JSON")

    handled: list[str] = []
    for entry in event.get("entry", []) or []:
        for change in entry.get("changes", []) or []:
            value = change.get("value") or {}
            for st in value.get("statuses", []) or []:
                errors = st.get("errors") or [{}]
                msg.apply_status(db, st.get("id", ""), st.get("status", ""),
                                 errors[0].get("title") or errors[0].get("message"))
                handled.append("status")
            for m in value.get("messages", []) or []:
                phone = normalise_phone(m.get("from"))
                if not phone:
                    continue
                result = msg.handle_incoming(db, phone, _text_of(m), m.get("id"), (m.get("context") or {}).get("id"))
                handled.append(result)
    db.commit()
    return {"status": "ok", "handled": handled}
