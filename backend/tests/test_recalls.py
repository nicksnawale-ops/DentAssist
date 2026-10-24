from datetime import datetime, timedelta, timezone

API = "/api/v1"
CENTRAL = "c1b48b94-132d-41a4-8f77-e2307fbadd2f"
WESTSIDE = "dbbd4709-3224-4f01-b541-ef17621436dd"
EVAN_PHONE = "919876555555"  # pat_5


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def recalls(client, h, **params):
    res = client.get(f"{API}/recalls", headers=h, params=params)
    assert res.status_code == 200, res.text
    return res.json()


def by_patient(rows, pid, kind="checkup"):
    return next((r for r in rows if r["patientId"] == pid and r["kind"] == kind), None)


def db_session():
    from app.core.database import get_db
    from app.main import app

    return next(app.dependency_overrides[get_db]())


def test_checkup_recalls_from_last_visit(client, as_role):
    h = as_role("receptionist")
    rows = recalls(client, h)
    evan = by_patient(rows, "pat_5")
    assert evan and evan["status"] == "due" and evan["isDue"]
    assert by_patient(rows, "pat_8"), "due within the next two weeks"
    assert by_patient(rows, "pat_4") is None, "seen 3 months ago"
    assert all(r["clinicId"] == CENTRAL for r in rows), "front desk only sees their clinic"
    # Running it again doesn't duplicate anything.
    assert client.post(f"{API}/recalls/refresh", headers=h).json()["created"] == 0
    assert len(recalls(client, h)) == len(rows)


def test_send_recall_and_patient_replies_book(client, as_role):
    h = as_role("receptionist")
    evan = by_patient(recalls(client, h), "pat_5")
    res = client.post(f"{API}/recalls/{evan['id']}/send", headers=h).json()
    assert res["status"] == "sent"
    after = by_patient(recalls(client, h, status="contacted"), "pat_5")
    assert after["contactCount"] == 1 and not after["isDue"]

    msg = client.get(f"{API}/messaging/log", headers=h, params={"patientId": "pat_5"}).json()[0]
    assert msg["kind"] == "recall_checkup" and f"/book/{CENTRAL}" in msg["body"]

    from tests.test_messaging import inbound

    assert inbound(client, EVAN_PHONE, "Book", "wamid.r1").json()["handled"] == ["recall_book_requested"]
    titles = [n["title"] for n in client.get(f"{API}/notifications", headers=h).json()]
    assert "Recall: wants to book" in titles


def test_opted_out_recall_stays_due(client, as_role):
    h = as_role("receptionist")
    george = by_patient(recalls(client, h), "pat_7")
    res = client.post(f"{API}/recalls/send", headers=h, json={"ids": [george["id"]]}).json()
    assert res[0]["status"] == "skipped"
    assert by_patient(recalls(client, h), "pat_7")["status"] == "due"
    assert by_patient(recalls(client, h), "pat_7")["whatsappOptIn"] is False


def test_booking_closes_recall(client, as_role):
    h = as_role("receptionist")
    assert by_patient(recalls(client, h), "pat_5")
    start = (datetime.now(timezone.utc) + timedelta(days=3)).replace(second=0, microsecond=0)
    appt = client.post(f"{API}/appointments", headers=h, json={
        "patientId": "pat_5", "dentistId": "s1", "clinicId": CENTRAL, "startTime": iso(start),
        "endTime": iso(start + timedelta(minutes=30)), "procedureType": "Checkup", "allowOverlap": True}).json()
    booked = by_patient(recalls(client, h, status="booked"), "pat_5")
    assert booked and booked["appointmentId"] == appt["id"]
    assert client.get(f"{API}/recalls/summary", headers=h).json()["bookedLast30Days"] >= 1


def test_dismiss_and_snooze(client, as_role):
    h = as_role("receptionist")
    r = by_patient(recalls(client, h), "pat_6")
    later = (datetime.now(timezone.utc) + timedelta(days=20)).date().isoformat()
    snoozed = client.patch(f"{API}/recalls/{r['id']}", headers=h, json={"dueDate": later}).json()
    assert snoozed["dueDate"] == later and not snoozed["isDue"]
    dismissed = client.patch(f"{API}/recalls/{r['id']}", headers=h, json={"status": "dismissed", "notes": "Moved city"}).json()
    assert dismissed["status"] == "dismissed"
    client.post(f"{API}/recalls/refresh", headers=h)
    assert by_patient(recalls(client, h, status="due,contacted"), "pat_6") is None, "dismissed recalls don't come back"


def test_unfinished_treatment_plan_recall(client, as_role):
    from app.models import TreatmentPlan

    db = db_session()
    plan = db.query(TreatmentPlan).filter_by(patient_id="pat_1", status="In Progress").first()
    old = datetime.now(timezone.utc) - timedelta(days=30)
    plan.updated_at = old
    for item in plan.items:
        if item.completed_at:
            item.completed_at = old
    db.commit()
    db.close()

    h = as_role("receptionist")
    r = by_patient(recalls(client, h, kind="treatment"), "pat_1", "treatment")
    assert r and r["treatmentPlanName"] == "Phase 1: restorative work" and "steps left" in r["reason"]
    sent = client.post(f"{API}/recalls/{r['id']}/send", headers=h).json()
    assert sent["status"] == "sent"
    body = client.get(f"{API}/messaging/log", headers=h, params={"patientId": "pat_1"}).json()[0]["body"]
    assert "Phase 1: restorative work" in body


def test_review_request_after_visit_once(client, as_role):
    h = as_role("receptionist")
    start = (datetime.now(timezone.utc) - timedelta(hours=5)).replace(second=0, microsecond=0)
    appt = client.post(f"{API}/appointments", headers=h, json={
        "patientId": "pat_5", "dentistId": "s1", "clinicId": CENTRAL, "startTime": iso(start),
        "endTime": iso(start + timedelta(minutes=30)), "procedureType": "Checkup", "allowOverlap": True}).json()
    client.patch(f"{API}/appointments/{appt['id']}", headers=h, json={"status": "completed"})

    a = as_role("super_admin")
    first = client.post(f"{API}/recalls/run-jobs", headers=a).json()
    second = client.post(f"{API}/recalls/run-jobs", headers=a).json()
    assert first["reviewRequests"] == 1 and second["reviewRequests"] == 0
    msg = [m for m in client.get(f"{API}/messaging/log", headers=h, params={"patientId": "pat_5"}).json()
           if m["kind"] == "review_request"]
    assert len(msg) == 1 and "g.page" in msg[0]["body"]
    assert client.post(f"{API}/recalls/run-jobs", headers=h).status_code == 403


def test_review_link_and_settings_permissions(client, as_role):
    admin = as_role("admin")  # Westside admin
    ok = client.put(f"{API}/clinics/{WESTSIDE}/google-review-url", headers=admin,
                    json={"googleReviewUrl": "https://g.page/r/westside/review"})
    assert ok.status_code == 200 and ok.json()["googleReviewUrl"].endswith("/review")
    assert client.put(f"{API}/clinics/{CENTRAL}/google-review-url", headers=admin,
                      json={"googleReviewUrl": "https://g.page/x"}).status_code == 403
    assert client.put(f"{API}/clinics/{WESTSIDE}/google-review-url", headers=admin,
                      json={"googleReviewUrl": "http://insecure"}).status_code == 422

    h = as_role("receptionist")
    assert client.put(f"{API}/recalls/settings", headers=h, json={"checkupIntervalMonths": 3}).status_code == 403
    saved = client.put(f"{API}/recalls/settings", headers=admin, json={"checkupIntervalMonths": 9}).json()
    assert saved["checkupIntervalMonths"] == 9 and saved["reviewRequestsEnabled"] is True
    assert client.get(f"{API}/recalls/settings", headers=h).json()["checkupIntervalMonths"] == 9
