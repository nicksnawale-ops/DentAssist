from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

API = "/api/v1"
CENTRAL = "c1b48b94-132d-41a4-8f77-e2307fbadd2f"
IST = ZoneInfo("Asia/Kolkata")
PERIOD = datetime.now(IST).strftime("%Y-%m")


def generate(client, h, clinic=CENTRAL, period=PERIOD):
    res = client.post(f"{API}/payouts/generate", headers=h, json={"period": period, "clinicId": clinic})
    assert res.status_code == 200, res.text
    return res.json()


def smith(rows):
    return next(p for p in rows if p["staffId"] == "s1")


def collect(client, h, amount, dentist="s1", patient="pat_2"):
    inv = client.post(f"{API}/invoices", headers=h, json={
        "patientId": patient, "dentistId": dentist, "sendNow": True,
        "lineItems": [{"procedureName": "Consultation", "quantity": 1, "unitCost": amount}],
        "dueDate": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()}).json()
    res = client.post(f"{API}/invoices/{inv['id']}/payments", headers=h, json={"amount": amount, "method": "UPI"})
    assert res.status_code == 201, res.text


def test_statement_follows_the_formula(client, as_role):
    a = as_role("super_admin")
    f = smith(generate(client, a))["figures"]
    assert f["plan"]["percent"] == 40 and f["plan"]["labSharePercent"] == 50
    assert abs(f["labDeduction"] - f["labCosts"] * 0.5) < 0.01
    assert abs(f["base"] - max(f["collections"] - f["labDeduction"], 0)) < 0.01
    assert abs(f["commission"] - round(f["base"] * 0.4, 2)) < 0.01
    assert f["gross"] >= 40000, "minimum guarantee"
    assert abs(f["guaranteeTopUp"] - max(40000 - (f["fixed"] + f["commission"] + f["adjustments"]), 0)) < 0.01
    assert abs(f["tds"] - round(f["gross"] * 0.1, 2)) < 0.01 and abs(f["net"] - (f["gross"] - f["tds"])) < 0.01


def test_new_collections_and_adjustments_update_the_draft(client, as_role):
    a = as_role("super_admin")
    before = smith(generate(client, a))
    collect(client, as_role("receptionist"), 150000)  # large enough to clear the guarantee
    after = smith(generate(client, a))
    assert after["id"] == before["id"], "regenerating refreshes the same draft"
    assert abs(after["figures"]["collections"] - before["figures"]["collections"] - 150000) < 0.01
    assert after["figures"]["guaranteeTopUp"] == 0

    adj = client.post(f"{API}/payouts/{after['id']}/adjustments", headers=a, json={"label": "Festival bonus", "amount": 5000}).json()
    assert abs(adj["figures"]["gross"] - after["figures"]["gross"] - 5000) < 0.01
    removed = client.delete(f"{API}/payouts/{after['id']}/adjustments/{adj['adjustments'][0]['id']}", headers=a).json()
    assert abs(removed["netAmount"] - after["netAmount"]) < 0.01
    assert client.post(f"{API}/payouts/{after['id']}/adjustments", headers=a, json={"label": "Zero", "amount": 0}).status_code == 422


def test_approve_locks_then_pay(client, as_role):
    a = as_role("super_admin")
    p = smith(generate(client, a))
    approved = client.post(f"{API}/payouts/{p['id']}/approve", headers=a).json()
    assert approved["status"] == "approved" and approved["approvedByName"]
    collect(client, as_role("receptionist"), 9999)
    regenerated = smith(generate(client, a))
    assert regenerated["netAmount"] == approved["netAmount"], "approved figures are frozen"
    assert client.post(f"{API}/payouts/{p['id']}/adjustments", headers=a, json={"label": "Late", "amount": 100}).status_code == 400

    # The dentist sees approved statements only.
    d = as_role("dentist")
    assert [x["id"] for x in client.get(f"{API}/payouts/mine", headers=d).json()] == [p["id"]]
    paid = client.post(f"{API}/payouts/{p['id']}/paid", headers=a, json={"method": "Bank Transfer", "reference": "NEFT123"}).json()
    assert paid["status"] == "paid" and paid["paymentReference"] == "NEFT123"
    assert client.post(f"{API}/payouts/{p['id']}/reopen", headers=a).status_code == 400


def test_permissions(client, as_role):
    assert client.get(f"{API}/payouts", headers=as_role("receptionist")).status_code == 403
    assert client.post(f"{API}/payouts/generate", headers=as_role("dentist"), json={"period": PERIOD}).status_code == 403
    admin = as_role("admin")  # Westside admin
    assert client.post(f"{API}/payouts/generate", headers=admin, json={"period": PERIOD, "clinicId": CENTRAL}).status_code == 403
    assert client.put(f"{API}/staff/s1/compensation", headers=admin, json={"clinicId": CENTRAL, "percent": 50}).status_code in (403, 404)
    bad = client.post(f"{API}/payouts/generate", headers=as_role("super_admin"), json={"period": "2026-13"})
    assert bad.status_code == 400


def test_pay_rules(client, as_role):
    a = as_role("super_admin")
    saved = client.put(f"{API}/staff/s1/compensation", headers=a, json={
        "clinicId": CENTRAL, "arrangement": "associate", "percent": 35, "labSharePercent": 0, "tdsPercent": 10}).json()
    assert saved["percent"] == 35
    assert len([p for p in client.get(f"{API}/staff/s1/compensation", headers=a).json() if p["clinicId"] == CENTRAL]) == 1
    empty = client.put(f"{API}/staff/s1/compensation", headers=a, json={"clinicId": CENTRAL, "percent": 0})
    assert empty.status_code == 400
    assert smith(generate(client, a))["figures"]["plan"]["percent"] == 35
    assert client.get(f"{API}/staff/s1/compensation", headers=as_role("dentist")).status_code == 200
    assert client.get(f"{API}/staff/s3/compensation", headers=as_role("dentist")).status_code == 403


# ---------- Attendance ----------

def test_check_in_and_out(client, as_role):
    r = as_role("receptionist")
    assert client.get(f"{API}/attendance/today", headers=r).json() is None
    cin = client.post(f"{API}/attendance/check-in", headers=r, json={}).json()
    assert cin["status"] == "present" and cin["checkInAt"] and cin["source"] == "self"
    assert client.post(f"{API}/attendance/check-in", headers=r, json={}).status_code == 400
    out = client.post(f"{API}/attendance/check-out", headers=r).json()
    assert out["checkOutAt"] and out["hours"] is not None
    assert client.post(f"{API}/attendance/check-out", headers=r).status_code == 400


def test_month_view_and_admin_edits(client, as_role):
    a = as_role("super_admin")
    rows = client.get(f"{API}/attendance", headers=a, params={"period": PERIOD, "clinicId": CENTRAL}).json()
    s1 = next(x for x in rows if x["staffId"] == "s1")
    assert {"present", "halfDay", "leave", "absent", "lateDays", "hours"} <= s1["summary"].keys()

    yesterday = (datetime.now(IST).date() - timedelta(days=1)).isoformat()
    leave = client.put(f"{API}/attendance/s2/{yesterday}", headers=a, json={"status": "leave", "note": "Sick leave"}).json()
    assert leave["status"] == "leave" and leave["checkInAt"] is None and leave["source"] == "admin"
    fixed = client.put(f"{API}/attendance/s2/{yesterday}", headers=a, json={"status": "present", "checkIn": "09:40", "checkOut": "18:00"}).json()
    assert fixed["lateMinutes"] >= 0 and fixed["hours"] > 8
    future = (datetime.now(IST).date() + timedelta(days=3)).isoformat()
    assert client.put(f"{API}/attendance/s2/{future}", headers=a, json={"status": "present"}).status_code == 400
    assert client.put(f"{API}/attendance/s2/{future}", headers=a, json={"status": "leave"}).status_code == 200
    backwards = client.put(f"{API}/attendance/s2/{yesterday}", headers=a, json={"status": "present", "checkIn": "18:00", "checkOut": "09:00"})
    assert backwards.status_code == 400
    assert client.get(f"{API}/attendance", headers=as_role("receptionist"), params={"period": PERIOD}).status_code == 403


def test_late_minutes_uses_working_hours(client):
    from app.core.database import get_db
    from app.main import app
    from app.models import Clinic, User
    from app.services import payouts

    db = next(app.dependency_overrides[get_db]())
    s1, central = db.get(User, "s1"), db.get(Clinic, CENTRAL)
    monday = date(2026, 10, 26)
    at = lambda h, m: datetime(monday.year, monday.month, monday.day, h, m, tzinfo=IST)  # noqa: E731
    assert payouts.late_minutes(s1, central, at(9, 5)) == 0, "within the grace period"
    assert payouts.late_minutes(s1, central, at(9, 45)) == 45
    db.close()
