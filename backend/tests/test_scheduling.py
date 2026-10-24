from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from app.services import ratelimit

API = "/api/v1"
CENTRAL = "c1b48b94-132d-41a4-8f77-e2307fbadd2f"
IST = ZoneInfo("Asia/Kolkata")


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    ratelimit.reset()
    yield
    ratelimit.reset()


def next_weekday(weekday: int, min_days: int = 2) -> date:
    """Next given weekday (0 = Monday) at least `min_days` away, in clinic time."""
    d = datetime.now(IST).date() + timedelta(days=min_days)
    while d.weekday() != weekday:
        d += timedelta(days=1)
    return d


def test_slots_follow_clinic_and_dentist_hours(client, as_role):
    h = as_role("receptionist")
    tue = next_weekday(1)
    slots = client.get(f"{API}/availability", headers=h,
                       params={"clinicId": CENTRAL, "date": tue.isoformat(), "duration": 30, "dentistId": "s1"}).json()
    assert slots, "Dr Smith works Tuesdays"
    local = [datetime.fromisoformat(s["startTime"].replace("Z", "+00:00")).replace(tzinfo=timezone.utc).astimezone(IST) for s in slots]
    assert min(t.hour for t in local) >= 9
    assert max(t + timedelta(minutes=30) for t in local).time() <= datetime.strptime("17:00", "%H:%M").time()

    sunday = next_weekday(6)
    assert client.get(f"{API}/availability", headers=h, params={
        "clinicId": CENTRAL, "date": sunday.isoformat(), "duration": 30}).json() == []
    # Dr Anil is on leave, so has no slots.
    assert client.get(f"{API}/availability", headers=h, params={
        "clinicId": CENTRAL, "date": tue.isoformat(), "duration": 30, "dentistId": "s3"}).json() == []


def test_booked_time_disappears_from_slots(client, as_role):
    h = as_role("receptionist")
    wed = next_weekday(2)
    params = {"clinicId": CENTRAL, "date": wed.isoformat(), "duration": 30, "dentistId": "s1"}
    before = client.get(f"{API}/availability", headers=h, params=params).json()
    pick = before[3]
    res = client.post(f"{API}/appointments", headers=h, json={
        "patientId": "pat_3", "dentistId": "s1", "clinicId": CENTRAL, "startTime": pick["startTime"],
        "endTime": pick["endTime"], "procedureType": "Checkup"})
    assert res.status_code == 201
    after = client.get(f"{API}/availability", headers=h, params=params).json()
    assert pick["startTime"] not in {s["startTime"] for s in after}
    assert len(after) < len(before)


def test_next_available(client, as_role):
    slots = client.get(f"{API}/availability/next", headers=as_role("receptionist"),
                       params={"clinicId": CENTRAL, "duration": 45, "limit": 5}).json()
    assert 1 <= len(slots) <= 5
    starts = [s["startTime"] for s in slots]
    assert starts == sorted(starts)


# ---------- Public booking page ----------

def test_public_clinic_page(client):
    info = client.get(f"{API}/public/clinics/{CENTRAL}").json()
    names = [d["name"] for d in info["dentists"]]
    assert "Dr. Sarah Smith" in names and not any("Anil" in n for n in names)  # on leave
    assert {v["key"] for v in info["visitTypes"]} >= {"checkup", "consultation"}
    assert "patients" not in info


def test_public_booking_creates_patient_and_alerts_reception(client, as_role):
    slots = client.get(f"{API}/public/clinics/{CENTRAL}/availability", params={"visitType": "checkup"}).json()
    assert slots
    res = client.post(f"{API}/public/clinics/{CENTRAL}/bookings", json={
        "name": "Rohan Kulkarni", "phone": "+91 99887 12345", "visitType": "checkup",
        "startTime": slots[0]["startTime"], "notes": "Bleeding gums"})
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "booked" and body["visitType"] == "Check-up and cleaning"
    assert "patientId" not in body

    h = as_role("receptionist")
    found = client.get(f"{API}/patients", headers=h, params={"search": "Rohan"}).json()
    assert found and "Online booking" in found[0]["tags"]
    appt = client.get(f"{API}/appointments/{body['appointmentId']}", headers=h).json()
    assert appt["notes"].startswith("Booked online") and appt["status"] == "scheduled"
    notes = client.get(f"{API}/notifications", headers=h).json()
    assert notes[0]["title"] == "New online booking"


def test_public_booking_reuses_patient_by_phone_without_leaking(client, as_role):
    slots = client.get(f"{API}/public/clinics/{CENTRAL}/availability", params={"visitType": "consultation"}).json()
    res = client.post(f"{API}/public/clinics/{CENTRAL}/bookings", json={
        "name": "Someone Else", "phone": "98765 11111", "visitType": "consultation", "startTime": slots[0]["startTime"]})
    body = res.json()
    assert res.status_code == 201 and "Alice" not in str(body)
    appt = client.get(f"{API}/appointments/{body['appointmentId']}", headers=as_role("receptionist")).json()
    assert appt["patientId"] == "pat_1"


def test_public_slot_taken_and_validation(client):
    slots = client.get(f"{API}/public/clinics/{CENTRAL}/availability", params={"visitType": "checkup", "dentistId": "s1"}).json()
    first = {"name": "A Patient", "phone": "9000000001", "visitType": "checkup", "dentistId": "s1",
             "startTime": slots[0]["startTime"]}
    assert client.post(f"{API}/public/clinics/{CENTRAL}/bookings", json=first).status_code == 201
    again = client.post(f"{API}/public/clinics/{CENTRAL}/bookings", json={**first, "phone": "9000000002"})
    assert again.status_code == 409 and again.json()["code"] == "SLOT_TAKEN"

    soon = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
    late = client.post(f"{API}/public/clinics/{CENTRAL}/bookings", json={**first, "phone": "9000000003", "startTime": soon})
    assert late.json()["code"] == "TOO_LATE"
    bad = client.post(f"{API}/public/clinics/{CENTRAL}/bookings", json={**first, "phone": "123"})
    assert bad.status_code == 422


def test_public_honeypot_and_rate_limit(client, as_role):
    slots = client.get(f"{API}/public/clinics/{CENTRAL}/availability", params={"visitType": "consultation"}).json()
    bot = client.post(f"{API}/public/clinics/{CENTRAL}/bookings", json={
        "name": "Bot", "phone": "9111111111", "visitType": "consultation", "startTime": slots[0]["startTime"],
        "website": "http://spam.example"})
    assert bot.json() == {"status": "received"}
    assert client.get(f"{API}/patients", headers=as_role("receptionist"), params={"search": "Bot"}).json() == []
    for i in range(4):
        client.post(f"{API}/public/clinics/{CENTRAL}/bookings", json={"name": "X Y", "phone": f"92222222{i:02d}",
                                                                      "visitType": "nope", "startTime": slots[0]["startTime"]})
    limited = client.post(f"{API}/public/clinics/{CENTRAL}/bookings", json={
        "name": "X Y", "phone": "9333333333", "visitType": "consultation", "startTime": slots[0]["startTime"]})
    assert limited.status_code == 429


def test_online_booking_can_be_switched_off(client, as_role):
    client.patch(f"{API}/clinics/{CENTRAL}", headers=as_role("super_admin"), json={"onlineBookingEnabled": False})
    res = client.get(f"{API}/public/clinics/{CENTRAL}")
    assert res.status_code == 403 and res.json()["code"] == "BOOKING_DISABLED"


def test_unknown_or_inactive_clinic_is_hidden(client):
    assert client.get(f"{API}/public/clinics/nope").status_code == 404
    assert client.get(f"{API}/public/clinics/c3").status_code == 404  # inactive


# ---------- Waitlist ----------

def test_cancelling_alerts_front_desk_about_waitlist(client, as_role):
    h = as_role("receptionist")
    slot = client.get(f"{API}/availability/next", headers=h, params={"clinicId": CENTRAL, "dentistId": "s1", "duration": 30}).json()[0]
    appt = client.post(f"{API}/appointments", headers=h, json={
        "patientId": "pat_2", "dentistId": "s1", "clinicId": CENTRAL, "startTime": slot["startTime"],
        "endTime": slot["endTime"], "procedureType": "Filling"}).json()
    client.post(f"{API}/appointments/{appt['id']}/cancel", headers=h, json={"reason": "Travelling"})

    alert = client.get(f"{API}/notifications", headers=h).json()[0]
    assert alert["title"] == "A slot opened up" and "Bob" not in alert["message"]
    matches = client.get(f"{API}/appointments/{appt['id']}/waitlist-matches", headers=h).json()
    assert [m["patientId"] for m in matches] == ["pat_4"]

    # Booking the waitlisted patient into the freed slot takes them off the waitlist.
    booked = client.post(f"{API}/appointments", headers=h, json={
        "patientId": "pat_4", "dentistId": "s1", "clinicId": CENTRAL, "startTime": slot["startTime"],
        "endTime": slot["endTime"], "procedureType": "Filling", "waitlistEntryId": matches[0]["entryId"]})
    assert booked.status_code == 201
    assert client.get(f"{API}/waitlist", headers=h).json() == []
