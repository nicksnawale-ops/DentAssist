import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import get_settings

API = "/api/v1"
CENTRAL = "c1b48b94-132d-41a4-8f77-e2307fbadd2f"
ALICE_PHONE = "919876511111"  # pat_1, opted in
BOB_PHONE = "919876522222"  # pat_2, opted out


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def book(client, h, patient="pat_1", hours_ahead=24.0, minutes=30, **extra):
    start = (datetime.now(timezone.utc) + timedelta(hours=hours_ahead)).replace(second=0, microsecond=0)
    res = client.post(f"{API}/appointments", headers=h, json={
        "patientId": patient, "dentistId": "s1", "clinicId": CENTRAL, "startTime": iso(start),
        "endTime": iso(start + timedelta(minutes=minutes)), "procedureType": "Checkup", "allowOverlap": True, **extra})
    assert res.status_code == 201, res.text
    return res.json()


def log(client, h, **params):
    return client.get(f"{API}/messaging/log", headers=h, params=params).json()


def inbound(client, phone, text, msg_id, context_id=None, headers=None):
    message = {"from": phone, "id": msg_id, "type": "text", "text": {"body": text}}
    if context_id:
        message["context"] = {"id": context_id}
    body = {"entry": [{"changes": [{"value": {"messages": [message]}}]}]}
    return client.post(f"{API}/webhooks/whatsapp", content=json.dumps(body), headers=headers or {})


def test_status_and_templates(client, as_role):
    h = as_role("receptionist")
    st = client.get(f"{API}/messaging/status", headers=h).json()
    assert st["provider"] == "console" and st["ready"] and not st["live"]
    keys = {t["key"] for t in client.get(f"{API}/messaging/templates", headers=h).json()}
    assert {"reminder_24h", "booking_confirmation", "invoice_issued", "slot_offer"} <= keys

    # Only admins edit templates, and the placeholders must stay.
    assert client.put(f"{API}/messaging/templates/reminder_2h", headers=h, json={"enabled": False}).status_code == 403
    a = as_role("super_admin")
    bad = client.put(f"{API}/messaging/templates/reminder_2h", headers=a, json={"body": "See you soon {{1}}"})
    assert bad.status_code == 400 and bad.json()["code"] == "TEMPLATE_PLACEHOLDERS"
    ok = client.put(f"{API}/messaging/templates/reminder_2h", headers=a, json={"enabled": False})
    assert ok.status_code == 200 and ok.json()["enabled"] is False


def test_staff_booking_sends_confirmation_only_when_asked(client, as_role):
    h = as_role("receptionist")
    book(client, h, hours_ahead=50)
    assert log(client, h, patientId="pat_1") == []
    appt = book(client, h, hours_ahead=52, sendWhatsapp=True)
    rows = log(client, h, patientId="pat_1")
    assert len(rows) == 1
    assert rows[0]["kind"] == "booking_confirmation" and rows[0]["status"] == "sent"
    assert rows[0]["phone"] == ALICE_PHONE and rows[0]["appointmentId"] == appt["id"]
    assert "Alice" in rows[0]["body"] and "{{" not in rows[0]["body"]


def test_opted_out_patient_is_skipped(client, as_role):
    h = as_role("receptionist")
    appt = book(client, h, patient="pat_2", hours_ahead=30)
    res = client.post(f"{API}/appointments/{appt['id']}/remind", headers=h).json()
    assert res["status"] == "skipped" and "opted in" in res["detail"]


def test_reminder_job_sends_once(client, as_role):
    h = as_role("receptionist")
    due = book(client, h, hours_ahead=24)
    later = book(client, h, hours_ahead=60)  # not due yet
    a = as_role("super_admin")
    first = client.post(f"{API}/messaging/reminders/run", headers=a).json()
    second = client.post(f"{API}/messaging/reminders/run", headers=a).json()
    assert first["sent"] >= 1 and second["sent"] == 0
    reminders = [r["appointmentId"] for r in log(client, h, patientId="pat_1") if r["kind"] == "reminder_24h"]
    assert reminders.count(due["id"]) == 1
    assert later["id"] not in reminders
    assert client.post(f"{API}/messaging/reminders/run", headers=h).status_code == 403


def test_reply_confirm_and_cancel(client, as_role):
    h = as_role("receptionist")
    appt = book(client, h, hours_ahead=26, sendWhatsapp=True)
    sent = log(client, h, patientId="pat_1")[0]

    res = inbound(client, ALICE_PHONE, " Confirm ", "wamid.in1")
    assert res.status_code == 200 and res.json()["handled"] == ["confirmed"]
    assert client.get(f"{API}/appointments/{appt['id']}", headers=h).json()["status"] == "confirmed"
    # Meta retries webhooks; the same message must not be handled twice.
    assert inbound(client, ALICE_PHONE, "Confirm", "wamid.in1").json()["handled"] == ["duplicate"]

    res = inbound(client, ALICE_PHONE, "CANCEL", "wamid.in2", context_id=sent["providerMessageId"])
    assert res.json()["handled"] == ["cancelled"]
    assert client.get(f"{API}/appointments/{appt['id']}", headers=h).json()["status"] == "cancelled"
    titles = [n["title"] for n in client.get(f"{API}/notifications", headers=h).json()]
    assert "Cancelled on WhatsApp" in titles

    kinds = [(r["direction"], r["kind"]) for r in log(client, h, patientId="pat_1")]
    assert kinds.count(("inbound", "inbound")) == 2 and kinds.count(("outbound", "text")) == 2


def test_unknown_reply_goes_to_front_desk(client, as_role):
    h = as_role("receptionist")
    book(client, h, hours_ahead=26, sendWhatsapp=True)
    assert inbound(client, ALICE_PHONE, "Can I bring my son too?", "wamid.q1").json()["handled"] == ["forwarded"]
    note = client.get(f"{API}/notifications", headers=h).json()[0]
    assert note["title"] == "WhatsApp message" and "bring my son" in note["message"]


def test_free_reply_only_inside_24h_window(client, as_role):
    h = as_role("receptionist")
    blocked = client.post(f"{API}/messaging/reply", headers=h, json={"phone": "+91 98765 11111", "text": "Hello"})
    assert blocked.status_code == 409 and blocked.json()["code"] == "OUTSIDE_REPLY_WINDOW"
    book(client, h, hours_ahead=26, sendWhatsapp=True)
    inbound(client, ALICE_PHONE, "Is parking available?", "wamid.p1")
    ok = client.post(f"{API}/messaging/reply", headers=h, json={"phone": "+91 98765 11111", "text": "Yes, in the basement."})
    assert ok.status_code == 200 and ok.json()["status"] == "sent"
    # Staff at another clinic can't reply to this conversation.
    other = client.post(f"{API}/messaging/reply", headers=as_role("admin"), json={"phone": ALICE_PHONE, "text": "Hi"})
    assert other.status_code == 404


def test_status_updates_move_forward_only(client, as_role):
    h = as_role("receptionist")
    book(client, h, hours_ahead=26, sendWhatsapp=True)
    pid = log(client, h, patientId="pat_1")[0]["providerMessageId"]
    assert pid

    def status(s):
        body = {"entry": [{"changes": [{"value": {"statuses": [{"id": pid, "status": s}]}}]}]}
        client.post(f"{API}/webhooks/whatsapp", content=json.dumps(body))
        return log(client, h, patientId="pat_1")[0]["status"]

    assert status("delivered") == "delivered"
    assert status("read") == "read"
    assert status("delivered") == "read"


def test_webhook_signature_required_when_secret_set(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "whatsapp_app_secret", "shh")
    body = json.dumps({"entry": []}).encode()
    assert client.post(f"{API}/webhooks/whatsapp", content=body).status_code == 401
    bad = {"X-Hub-Signature-256": "sha256=" + "0" * 64}
    assert client.post(f"{API}/webhooks/whatsapp", content=body, headers=bad).status_code == 401
    sig = "sha256=" + hmac.new(b"shh", body, hashlib.sha256).hexdigest()
    assert client.post(f"{API}/webhooks/whatsapp", content=body, headers={"X-Hub-Signature-256": sig}).status_code == 200


def test_webhook_verification_handshake(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "whatsapp_verify_token", "verify-me")
    ok = client.get(f"{API}/webhooks/whatsapp", params={"hub.mode": "subscribe", "hub.verify_token": "verify-me",
                                                        "hub.challenge": "12345"})
    assert ok.status_code == 200 and ok.text == "12345"
    bad = client.get(f"{API}/webhooks/whatsapp", params={"hub.mode": "subscribe", "hub.verify_token": "nope",
                                                         "hub.challenge": "1"})
    assert bad.status_code == 403


def test_waitlist_offer_first_yes_wins(client, as_role):
    h = as_role("receptionist")
    slot = client.get(f"{API}/availability/next", headers=h,
                      params={"clinicId": CENTRAL, "dentistId": "s1", "duration": 30}).json()[0]
    appt = client.post(f"{API}/appointments", headers=h, json={
        "patientId": "pat_2", "dentistId": "s1", "clinicId": CENTRAL, "startTime": slot["startTime"],
        "endTime": slot["endTime"], "procedureType": "Filling"}).json()
    client.post(f"{API}/appointments/{appt['id']}/cancel", headers=h, json={"reason": "Travelling"})
    entry = client.get(f"{API}/appointments/{appt['id']}/waitlist-matches", headers=h).json()[0]

    sent = client.post(f"{API}/appointments/{appt['id']}/offer-to-waitlist", headers=h,
                       json={"entryIds": [entry["entryId"]]}).json()
    assert sent[0]["status"] == "sent"
    again = client.post(f"{API}/appointments/{appt['id']}/offer-to-waitlist", headers=h,
                        json={"entryIds": [entry["entryId"]]}).json()
    assert again[0]["status"] == "duplicate"

    diana = "919876544444"  # pat_4
    assert inbound(client, diana, "Yes", "wamid.y1").json()["handled"] == ["offer_accepted"]
    assert client.get(f"{API}/waitlist", headers=h).json() == []
    booked = client.get(f"{API}/appointments", headers=h, params={"patientId": "pat_4"}).json()
    assert any(b["startTime"].startswith(slot["startTime"][:16]) and b["status"] == "confirmed" for b in booked)


@pytest.mark.parametrize("raw,expected", [
    ("+91 98765 11111", "919876511111"), ("09876511111", "919876511111"), ("9876511111", "919876511111"),
    ("12345", None), ("", None),
])
def test_phone_normalisation(raw, expected):
    from app.services.whatsapp import normalise_phone

    assert normalise_phone(raw) == expected


# ---------- Staff reminder wording and languages ----------

FIONA_PHONE = "919876566666"  # pat_6, opted in, prefers Hindi


def test_staff_reminder_does_not_say_tomorrow(client, as_role):
    h = as_role("receptionist")
    appt = book(client, h, hours_ahead=24 * 4)
    res = client.post(f"{API}/appointments/{appt['id']}/remind", headers=h).json()
    assert res["status"] == "sent"
    assert res["message"]["kind"] == "appointment_reminder"
    assert "tomorrow" not in res["message"]["body"].lower()
    # The staff reminder can be sent again; automatic reminders are still sent once.
    again = client.post(f"{API}/appointments/{appt['id']}/remind", headers=h).json()
    assert again["status"] == "sent"


def test_hindi_patient_gets_hindi_message_and_dates(client, as_role):
    a = as_role("super_admin")
    book(client, a, patient="pat_6", hours_ahead=50, sendWhatsapp=True)
    row = log(client, a, patientId="pat_6")[0]
    assert row["language"] == "hi"
    assert row["body"].startswith("नमस्ते Fiona")
    assert not any(day in row["body"] for day in ("Mon ", "Tue ", "Wed ", "Thu ", "Fri ", "Sat ", "Sun "))
    assert "{{" not in row["body"]


def test_reply_in_hindi_confirms_and_answers_in_hindi(client, as_role):
    a = as_role("super_admin")
    appt = book(client, a, patient="pat_6", hours_ahead=50, sendWhatsapp=True)
    assert inbound(client, FIONA_PHONE, "हाँ", "wamid.hi1").json()["handled"] == ["confirmed"]
    assert client.get(f"{API}/appointments/{appt['id']}", headers=a).json()["status"] == "confirmed"
    answer = [r for r in log(client, a, patientId="pat_6") if r["kind"] == "text"][0]
    assert answer["body"].startswith("धन्यवाद")


def test_switched_off_translation_falls_back_to_english(client, as_role):
    a = as_role("super_admin")
    res = client.put(f"{API}/messaging/templates/booking_confirmation", headers=a,
                     json={"translations": {"hi": {"enabled": False}}})
    assert res.status_code == 200 and res.json()["translations"]["hi"]["enabled"] is False
    book(client, a, patient="pat_6", hours_ahead=50, sendWhatsapp=True)
    row = log(client, a, patientId="pat_6")[0]
    assert row["language"] == "en" and row["body"].startswith("Hi Fiona")


def test_translation_edits_keep_placeholders(client, as_role):
    a = as_role("super_admin")
    bad = client.put(f"{API}/messaging/templates/reminder_2h", headers=a,
                     json={"translations": {"mr": {"body": "नमस्कार {{1}}"}}})
    assert bad.status_code == 400 and bad.json()["code"] == "TEMPLATE_PLACEHOLDERS"
    unknown = client.put(f"{API}/messaging/templates/reminder_2h", headers=a,
                         json={"translations": {"fr": {"enabled": False}}})
    assert unknown.status_code == 400


def test_unapproved_translation_retries_in_english(client, as_role, monkeypatch):
    from app.services import messaging
    from app.services.whatsapp import SendResult

    calls = []

    class PickyProvider:
        def send_template(self, to, template, language, params, preview):
            calls.append(language)
            if language != "en":
                return SendResult(False, error="Template name does not exist in the translation")
            return SendResult(True, "wamid.fallback")

        def send_text(self, to, text):
            return SendResult(True, "wamid.text")

    monkeypatch.setattr(messaging, "get_provider", lambda: PickyProvider())
    a = as_role("super_admin")
    book(client, a, patient="pat_6", hours_ahead=50, sendWhatsapp=True)
    row = log(client, a, patientId="pat_6")[0]
    assert calls == ["hi", "en"]
    assert row["status"] == "sent" and row["language"] == "en" and row["body"].startswith("Hi Fiona")


def test_language_helpers():
    from datetime import datetime as dt

    from app.services import message_i18n as i18n

    assert i18n.language_of({"language": "Marathi"}) == "mr"
    assert i18n.language_of({"language": "Tamil"}) == "en"
    assert i18n.language_of(None) == "en"
    tuesday = dt(2026, 10, 27, 10, 30)
    assert i18n.day_label(tuesday, "en") == "Tue 27 Oct"
    assert i18n.day_label(tuesday, "hi") == "मंगल 27 अक्टू"
    assert i18n.day_label(tuesday, "mr", with_weekday=False) == "27 ऑक्टो"


def test_every_translation_keeps_placeholders_in_order():
    from app.services.messaging import DEFAULT_TEMPLATES
    import re

    for key, tpl in DEFAULT_TEMPLATES.items():
        expected = [str(i) for i in range(1, len(tpl["params"]) + 1)]
        assert re.findall(r"\{\{(\d+)\}\}", tpl["body"]) == expected, key
        for lang, tr in tpl["translations"].items():
            assert re.findall(r"\{\{(\d+)\}\}", tr["body"]) == expected, (key, lang)
