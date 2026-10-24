"""WhatsApp providers.

- ConsoleProvider writes messages to the server log (default; nothing leaves the machine).
- MetaProvider sends through the WhatsApp Cloud API:
  https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates

Business-initiated messages (reminders, invoices) must use templates approved in Meta's
WhatsApp Manager. Free-text replies are only allowed within 24 hours of the patient's last
message, which is exactly when we use them (answering CONFIRM / CANCEL).
"""

import hashlib
import hmac
import logging
import re
import uuid
from dataclasses import dataclass

import httpx

from app.core.config import get_settings

log = logging.getLogger("dentassist.whatsapp")


@dataclass
class SendResult:
    ok: bool
    provider_message_id: str | None = None
    error: str | None = None


def normalise_phone(phone: str | None) -> str | None:
    """'+91 98765 11111' -> '919876511111'. Returns None when it can't be a mobile number."""
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) == 10:
        digits = get_settings().whatsapp_default_country_code + digits
    elif len(digits) == 11 and digits.startswith("0"):
        digits = get_settings().whatsapp_default_country_code + digits[1:]
    return digits if 11 <= len(digits) <= 15 else None


class ConsoleProvider:
    name = "console"

    def send_template(self, to: str, template: str, language: str, params: list[str], preview: str) -> SendResult:
        log.info("WhatsApp (console) to %s [%s/%s]: %s", to, template, language, preview)
        return SendResult(True, f"console-{uuid.uuid4().hex[:16]}")

    def send_text(self, to: str, text: str) -> SendResult:
        log.info("WhatsApp (console) to %s: %s", to, text)
        return SendResult(True, f"console-{uuid.uuid4().hex[:16]}")


class MetaProvider:
    name = "meta"

    def __init__(self):
        s = get_settings()
        self.url = f"https://graph.facebook.com/{s.whatsapp_api_version}/{s.whatsapp_phone_number_id}/messages"
        self.headers = {"Authorization": f"Bearer {s.whatsapp_access_token}"}

    def _post(self, body: dict) -> SendResult:
        try:
            res = httpx.post(self.url, json=body, headers=self.headers, timeout=15)
        except httpx.HTTPError as exc:
            return SendResult(False, error=f"Could not reach WhatsApp: {exc.__class__.__name__}")
        data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
        if res.status_code >= 400:
            err = (data.get("error") or {}).get("message") or f"HTTP {res.status_code}"
            return SendResult(False, error=err)
        msgs = data.get("messages") or [{}]
        return SendResult(True, msgs[0].get("id"))

    def send_template(self, to: str, template: str, language: str, params: list[str], preview: str) -> SendResult:
        components = [{"type": "body", "parameters": [{"type": "text", "text": p} for p in params]}] if params else []
        return self._post({
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {"name": template, "language": {"code": language}, "components": components},
        })

    def send_text(self, to: str, text: str) -> SendResult:
        return self._post({"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"body": text}})


def get_provider():
    s = get_settings()
    if s.whatsapp_provider == "meta" and s.whatsapp_ready:
        return MetaProvider()
    if s.whatsapp_provider == "console":
        return ConsoleProvider()
    return None


def verify_signature(body: bytes, header: str | None) -> bool:
    """Meta signs webhook bodies: X-Hub-Signature-256: sha256=<hex HMAC with the app secret>."""
    secret = get_settings().whatsapp_app_secret
    if not secret:
        # Unsigned webhooks are only accepted in local development with the console provider,
        # so the reply flow can be tried without a Meta account.
        s = get_settings()
        return s.whatsapp_provider == "console" and s.environment != "production"
    if not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header.split("=", 1)[1])
