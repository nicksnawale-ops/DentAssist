from datetime import datetime, timedelta, timezone

from app.services import ratelimit

API = "/api/v1"
CENTRAL = "c1b48b94-132d-41a4-8f77-e2307fbadd2f"


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def link(client, h, patient="pat_3", head="pat_1", relation="Child"):
    res = client.post(f"{API}/patients/{patient}/family", headers=h, json={"withPatientId": head, "relation": relation})
    assert res.status_code == 200, res.text
    return res.json()


# ---------- Families ----------

def test_link_members_and_change_head(client, as_role):
    h = as_role("receptionist")
    fam = link(client, h)
    assert fam["headPatientId"] == "pat_1" and {m["patientId"] for m in fam["members"]} == {"pat_1", "pat_3"}
    assert next(m for m in fam["members"] if m["patientId"] == "pat_3")["relation"] == "Child"
    assert client.get(f"{API}/patients/pat_3/family", headers=h).json()["id"] == fam["id"]
    moved = client.put(f"{API}/families/{fam['id']}/head", headers=h, json={"patientId": "pat_3"}).json()
    assert moved["headPatientId"] == "pat_3"
    # Someone already in another family must leave it first.
    other = client.post(f"{API}/patients/pat_14/family", headers=as_role("super_admin"), json={"withPatientId": "pat_1"})
    assert other.status_code == 409


def test_account_holder_acts_for_family_in_portal(client, as_role):
    p = as_role("patient")  # Alice, pat_1
    assert client.get(f"{API}/patients/pat_3/documents", headers=p).status_code == 404
    link(client, as_role("receptionist"))

    appts = client.get(f"{API}/patient-portal/appointments", headers=p).json()
    assert {"pat_1", "pat_3"} <= {a["patientId"] for a in appts}
    assert client.get(f"{API}/patients/pat_3/documents", headers=p).status_code == 200
    assert client.get(f"{API}/patient-portal/dental-chart", headers=p, params={"patientId": "pat_3"}).status_code == 200
    bills = client.get(f"{API}/patient-portal/invoices", headers=p).json()
    assert "pat_3" in {b["patientId"] for b in bills}

    slot = client.get(f"{API}/availability/next", headers=as_role("receptionist"),
                      params={"clinicId": CENTRAL, "dentistId": "s1", "duration": 30}).json()[-1]
    booked = client.post(f"{API}/patient-portal/appointments/book", headers=p, json={
        "patientId": "pat_3", "dentistId": "s1", "clinicId": CENTRAL, "startTime": slot["startTime"],
        "endTime": slot["endTime"], "procedureType": "Checkup"})
    assert booked.status_code == 201, booked.text
    assert booked.json()["patientId"] == "pat_3"

    # Removing pat_3 from the family removes access again.
    client.delete(f"{API}/patients/pat_3/family", headers=as_role("receptionist"))
    assert client.get(f"{API}/patients/pat_3/documents", headers=p).status_code == 404
    assert client.get(f"{API}/patients/pat_1/family", headers=p).json() is None, "a family of one is dissolved"


def test_family_statement_and_one_payment(client, as_role):
    h = as_role("receptionist")
    fam = link(client, h)
    st = client.get(f"{API}/families/{fam['id']}/statement", headers=h).json()
    assert st["invoices"] and st["totalDue"] > 0
    oldest = st["invoices"][0]
    pay = min(oldest["balanceDue"] + 1, st["totalDue"])
    res = client.post(f"{API}/families/{fam['id']}/payments", headers=h, json={"amount": pay, "method": "UPI"}).json()
    assert res["applied"][0]["invoiceNumber"] == oldest["invoiceNumber"]
    assert abs(sum(a["amount"] for a in res["applied"]) - pay) < 0.01
    after = client.get(f"{API}/families/{fam['id']}/statement", headers=h).json()
    assert abs(after["totalDue"] - (st["totalDue"] - pay)) < 0.01
    too_much = client.post(f"{API}/families/{fam['id']}/payments", headers=h, json={"amount": after["totalDue"] + 100, "method": "Cash"})
    assert too_much.status_code == 400
    assert client.post(f"{API}/families/{fam['id']}/payments", headers=as_role("dentist"), json={"amount": 1, "method": "Cash"}).status_code == 403


def test_same_phone_suggestions(client, as_role):
    a = as_role("super_admin")
    client.delete(f"{API}/patients/pat_15/family", headers=a)  # seeded together; split them
    sugg = client.get(f"{API}/patients/pat_14/family-suggestions", headers=a).json()
    assert [s["patientId"] for s in sugg] == ["pat_15"]


# ---------- QR check-in ----------

def book_soon(client, h, patient="pat_6", minutes=30):
    start = (datetime.now(timezone.utc) + timedelta(minutes=minutes)).replace(second=0, microsecond=0)
    res = client.post(f"{API}/appointments", headers=h, json={
        "patientId": patient, "dentistId": "s1", "clinicId": CENTRAL, "startTime": iso(start),
        "endTime": iso(start + timedelta(minutes=30)), "procedureType": "Checkup", "allowOverlap": True})
    assert res.status_code == 201, res.text
    return res.json()


def token(client, h):
    url = client.get(f"{API}/clinics/{CENTRAL}/checkin-link", headers=h).json()["url"]
    return url.split("t=", 1)[1]


def test_self_check_in(client, as_role):
    ratelimit.reset()
    h = as_role("receptionist")
    appt = book_soon(client, h)
    t = token(client, h)
    assert client.get(f"{API}/public/checkin/{CENTRAL}", params={"t": t}).json()["clinicName"]
    assert client.get(f"{API}/public/checkin/{CENTRAL}", params={"t": "wrong-token-123"}).status_code == 404

    found = client.post(f"{API}/public/checkin/{CENTRAL}/lookup", json={"t": t, "phone": "98765 66666"}).json()
    mine = next(f for f in found if f["appointmentId"] == appt["id"])
    assert mine["name"].startswith("F") and "Fiona" not in mine["name"] and not mine["alreadyArrived"]
    assert client.post(f"{API}/public/checkin/{CENTRAL}/lookup", json={"t": t, "phone": "9000000000"}).json() == []

    other = client.post(f"{API}/public/checkin/{CENTRAL}/confirm", json={"t": t, "phone": "9000000000", "appointmentId": appt["id"]})
    assert other.status_code == 404, "someone else's number can't check this patient in"
    ok = client.post(f"{API}/public/checkin/{CENTRAL}/confirm", json={"t": t, "phone": "+91 98765 66666", "appointmentId": appt["id"]}).json()
    assert ok["status"] == "arrived" and ok["firstName"] == "Fiona" and not ok["already"]
    again = client.post(f"{API}/public/checkin/{CENTRAL}/confirm", json={"t": t, "phone": "9876566666", "appointmentId": appt["id"]}).json()
    assert again["already"]

    queue = client.get(f"{API}/dashboard/receptionist", headers=h).json()["queue"]
    row = next(q for q in queue if q["id"] == appt["id"])
    assert row["status"] == "checked-in" and row["waitingMinutes"] is not None
    assert client.get(f"{API}/notifications", headers=as_role("dentist")).json()[0]["title"] == "Patient arrived"


def test_far_future_appointments_are_not_listed(client, as_role):
    ratelimit.reset()
    h = as_role("receptionist")
    later = book_soon(client, h, minutes=60 * 5)
    found = client.post(f"{API}/public/checkin/{CENTRAL}/lookup", json={"t": token(client, h), "phone": "9876566666"}).json()
    assert later["id"] not in {f["appointmentId"] for f in found}


def test_regenerate_retires_old_code(client, as_role):
    ratelimit.reset()
    old = token(client, as_role("receptionist"))
    assert client.post(f"{API}/clinics/{CENTRAL}/checkin-link/regenerate", headers=as_role("receptionist")).status_code == 403
    new = client.post(f"{API}/clinics/{CENTRAL}/checkin-link/regenerate", headers=as_role("super_admin")).json()["url"].split("t=")[1]
    assert new != old
    assert client.get(f"{API}/public/checkin/{CENTRAL}", params={"t": old}).status_code == 404


def test_front_desk_marks_arrival(client, as_role):
    h = as_role("receptionist")
    appt = book_soon(client, h)
    res = client.post(f"{API}/appointments/{appt['id']}/arrived", headers=h).json()
    assert res["arrivedAt"]
    assert client.get(f"{API}/appointments/{appt['id']}", headers=h).json()["arrivedAt"]
