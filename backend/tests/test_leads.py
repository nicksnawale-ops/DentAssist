import json
from datetime import datetime, timedelta, timezone

import pytest

from app.core.database import get_db
from app.main import app
from app.services import ratelimit

API = "/api/v1"
CENTRAL = "c1b48b94-132d-41a4-8f77-e2307fbadd2f"
WESTSIDE = "dbbd4709-3224-4f01-b541-ef17621436dd"


@pytest.fixture(autouse=True)
def _fresh_limits():
    ratelimit.reset()
    yield
    ratelimit.reset()


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def new_lead(client, h, **extra):
    body = {"clinicId": CENTRAL, "name": "Ravi Kumar", "phone": "+91 99887 76655", "source": "phone",
            "interest": "Implants", "estimatedValue": 40000, **extra}
    res = client.post(f"{API}/leads", headers=h, json=body)
    assert res.status_code == 201, res.text
    return res.json()


def inbound(client, phone, text, msg_id):
    body = {"entry": [{"changes": [{"value": {"messages": [{"from": phone, "id": msg_id, "type": "text", "text": {"body": text}}]}}]}]}
    return client.post(f"{API}/webhooks/whatsapp", content=json.dumps(body))


def test_create_lists_and_merges_repeat_enquiries(client, as_role):
    h = as_role("receptionist")
    first = new_lead(client, h)
    assert not first["merged"] and first["lead"]["status"] == "new" and first["lead"]["phone"] == "919988776655"
    again = new_lead(client, h, phone="9988776655", source="instagram", message="Any offer?")
    assert again["merged"] and again["lead"]["id"] == first["lead"]["id"]

    rows = client.get(f"{API}/leads", headers=h).json()
    assert sum(1 for r in rows if r["phone"] == "919988776655") == 1
    # The seeded overdue lead sorts first.
    assert rows[0]["isOverdue"]
    detail = client.get(f"{API}/leads/{first['lead']['id']}", headers=h).json()
    assert {a["kind"] for a in detail["activities"]} >= {"created", "enquired_again"}

    bad = client.post(f"{API}/leads", headers=h, json={"clinicId": CENTRAL, "name": "X", "phone": "12345678"})
    assert bad.status_code == 400 and bad.json()["code"] == "INVALID_PHONE"
    # Westside staff can't see Central's enquiries.
    assert client.get(f"{API}/leads/{first['lead']['id']}", headers=as_role("admin")).status_code in (403, 404)


def test_call_moves_to_contacted_and_lost_needs_reason(client, as_role):
    h = as_role("receptionist")
    lid = new_lead(client, h)["lead"]["id"]
    later = datetime.now(timezone.utc) + timedelta(days=3)
    called = client.post(f"{API}/leads/{lid}/activities", headers=h,
                         json={"kind": "call", "body": "Wants a quote", "outcome": "answered", "nextFollowUpAt": iso(later)}).json()
    assert called["status"] == "contacted" and called["contactCount"] == 1 and called["firstContactedAt"]
    assert not called["isOverdue"]

    no_reason = client.patch(f"{API}/leads/{lid}", headers=h, json={"status": "lost"})
    assert no_reason.status_code == 400 and no_reason.json()["code"] == "LOST_REASON_REQUIRED"
    lost = client.patch(f"{API}/leads/{lid}", headers=h, json={"status": "lost", "lostReason": "price"}).json()
    assert lost["status"] == "lost" and lost["closedAt"] and lost["nextFollowUpAt"] is None
    reopened = client.patch(f"{API}/leads/{lid}", headers=h, json={"status": "contacted"}).json()
    assert reopened["closedAt"] is None and reopened["lostReason"] is None


def test_assign_only_to_clinic_staff(client, as_role):
    h = as_role("receptionist")
    lid = new_lead(client, h)["lead"]["id"]
    bad = client.patch(f"{API}/leads/{lid}", headers=h, json={"assignedToId": "s3"})  # Westside dentist
    assert bad.status_code == 400 and bad.json()["code"] == "INVALID_ASSIGNEE"
    ok = client.patch(f"{API}/leads/{lid}", headers=h, json={"assignedToId": "s1"}).json()
    assert ok["assignedToName"].startswith("Sarah")
    notes = client.get(f"{API}/notifications", headers=as_role("dentist")).json()
    assert any(n["title"] == "Enquiry assigned to you" for n in notes)


def test_convert_then_booking_moves_pipeline(client, as_role):
    h = as_role("receptionist")
    lid = new_lead(client, h)["lead"]["id"]
    conv = client.post(f"{API}/leads/{lid}/convert", headers=h, json={}).json()
    pid = conv["patientId"]
    patient = client.get(f"{API}/patients/{pid}", headers=h).json()
    assert patient["firstName"] == "Ravi" and patient["referralSource"] == "Phone"
    # Converting twice links the same patient, never a duplicate.
    assert client.post(f"{API}/leads/{lid}/convert", headers=h, json={}).json()["patientId"] == pid

    start = (datetime.now(timezone.utc) + timedelta(days=2)).replace(second=0, microsecond=0)
    appt = client.post(f"{API}/appointments", headers=h, json={
        "patientId": pid, "dentistId": "s1", "clinicId": CENTRAL, "startTime": iso(start),
        "endTime": iso(start + timedelta(minutes=30)), "procedureType": "Consultation", "allowOverlap": True})
    assert appt.status_code == 201, appt.text
    lead = client.get(f"{API}/leads/{lid}", headers=h).json()
    assert lead["status"] == "consult_booked" and lead["appointmentId"] == appt.json()["id"]

    client.patch(f"{API}/appointments/{appt.json()['id']}", headers=h, json={"status": "completed"})
    assert client.get(f"{API}/leads/{lid}", headers=h).json()["status"] == "visited"
    won = client.patch(f"{API}/leads/{lid}", headers=h, json={"status": "won"}).json()
    assert won["status"] == "won" and won["convertedAt"]


def test_registered_patient_with_same_number_is_matched(client, as_role):
    h = as_role("receptionist")
    lid = new_lead(client, h, phone="+91 98765 11111", name="Alice")["lead"]["id"]  # Alice is pat_1
    assert client.get(f"{API}/leads/{lid}", headers=h).json()["patientId"] == "pat_1"


def test_public_form_honeypot_and_ack(client, as_role):
    form = client.get(f"{API}/public/enquiry/{CENTRAL}")
    assert form.status_code == 200 and "Implants" in form.json()["interests"]
    ok = client.post(f"{API}/public/enquiry/{CENTRAL}", json={
        "name": "Tara Singh", "phone": "9876012345", "interest": "Braces / aligners", "whatsappConsent": True,
        "utm": {"utm_source": "ig", "utm_campaign": "smile"}})
    assert ok.status_code == 201 and ok.json()["firstName"] == "Tara"
    h = as_role("receptionist")
    lead = next(r for r in client.get(f"{API}/leads", headers=h).json() if r["phone"] == "919876012345")
    assert lead["source"] == "instagram" and lead["campaign"]["utm_campaign"] == "smile"
    from sqlalchemy import select

    from app.models import MessageLog

    db = next(app.dependency_overrides[get_db]())
    ack = db.scalars(select(MessageLog).where(MessageLog.phone == "919876012345", MessageLog.kind == "lead_ack")).all()
    assert len(ack) == 1 and ack[0].status == "sent" and "Tara" in ack[0].body
    db.close()

    bot = client.post(f"{API}/public/enquiry/{CENTRAL}", json={"name": "Bot", "phone": "9876099999", "website": "http://spam"})
    assert bot.status_code == 201
    assert not any(r["phone"] == "919876099999" for r in client.get(f"{API}/leads", headers=h).json())
    assert client.get(f"{API}/public/enquiry/nope").status_code == 404


def test_public_form_is_rate_limited(client):
    codes = [client.post(f"{API}/public/enquiry/{CENTRAL}", json={"name": "A", "phone": f"98760{i:05d}"}).status_code
             for i in range(7)]
    assert codes[:5] == [201] * 5 and codes[-1] == 429


def test_webhook_needs_key_and_maps_fields(client, as_role):
    url = f"{API}/webhooks/leads/{CENTRAL}"
    assert client.post(url, params={"key": "wrong-key-123"}, json={"phone": "9876011111"}).status_code == 401
    res = client.post(url, params={"key": "demo-central-lead-key"}, json={
        "full_name": "Neha Gupta", "phone_number": "+919876022222", "treatment": "Teeth whitening",
        "utm_source": "facebook", "utm_campaign": "diwali"})
    assert res.status_code == 201, res.text
    lead = client.get(f"{API}/leads/{res.json()['id']}", headers=as_role("receptionist")).json()
    assert lead["name"] == "Neha Gupta" and lead["source"] == "facebook" and lead["interest"] == "Teeth whitening"
    links = client.get(f"{API}/clinics/{CENTRAL}/lead-capture", headers=as_role("receptionist")).json()
    assert links["webhookUrl"].endswith("key=demo-central-lead-key") and "/enquire/" in links["formUrl"]


def test_whatsapp_from_unknown_number_becomes_lead(client, as_role):
    res = inbound(client, "919811122233", "Hi, what is the cost of braces?", "wamid.lead1")
    assert res.json()["handled"] == ["lead_captured"]
    h = as_role("receptionist")
    lead = next(r for r in client.get(f"{API}/leads", headers=h).json() if r["phone"] == "919811122233")
    assert lead["source"] == "whatsapp" and lead["whatsappConsent"] and "braces" in lead["message"]
    # A second message adds to the same lead.
    assert inbound(client, "919811122233", "Also need cleaning", "wamid.lead2").json()["handled"] == ["lead_replied"]
    assert sum(1 for r in client.get(f"{API}/leads", headers=h).json() if r["phone"] == "919811122233") == 1


def test_follow_up_whatsapp_needs_consent(client, as_role):
    h = as_role("receptionist")
    lid = new_lead(client, h)["lead"]["id"]
    blocked = client.post(f"{API}/leads/{lid}/whatsapp", headers=h)
    assert blocked.status_code == 400 and blocked.json()["code"] == "NO_WHATSAPP_CONSENT"
    client.patch(f"{API}/leads/{lid}", headers=h, json={"whatsappConsent": True})
    sent = client.post(f"{API}/leads/{lid}/whatsapp", headers=h).json()
    assert sent["status"] == "sent" and sent["lead"]["status"] == "contacted"
    # Replying BOOK alerts the desk.
    assert inbound(client, "919988776655", "BOOK", "wamid.lead3").json()["handled"] == ["lead_book_requested"]


def test_follow_up_alerts_once(client, as_role):
    from app.services.leads import run_follow_up_alerts

    db = next(app.dependency_overrides[get_db]())
    first = run_follow_up_alerts(db)
    assert first >= 1  # seeded overdue leads
    assert run_follow_up_alerts(db) == 0
    db.close()


def test_summary_by_source(client, as_role):
    s = client.get(f"{API}/leads/summary", headers=as_role("receptionist"), params={"clinicId": CENTRAL}).json()
    assert s["total"] >= 10 and s["won"] >= 2 and s["uncontacted"] >= 2
    sources = {r["source"]: r for r in s["bySource"]}
    assert sources["instagram"]["leads"] == 2
    assert {"reason": "price", "count": 1} in s["lostReasons"]
    assert s["medianFirstResponseMinutes"] is not None
    # Admin-only settings
    assert client.put(f"{API}/leads/settings", headers=as_role("receptionist"), json={"followUpDays": 3}).status_code == 403
    saved = client.put(f"{API}/leads/settings", headers=as_role("super_admin"), json={"followUpDays": 3}).json()
    assert saved["followUpDays"] == 3 and saved["whatsappClinicId"] == CENTRAL
