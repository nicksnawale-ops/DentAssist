from datetime import date, datetime, timedelta, timezone

API = "/api/v1"
CENTRAL = "c1b48b94-132d-41a4-8f77-e2307fbadd2f"
WESTSIDE = "dbbd4709-3224-4f01-b541-ef17621436dd"


def overview(client, h, **params):
    res = client.get(f"{API}/analytics/overview", headers=h, params=params)
    assert res.status_code == 200, res.text
    return res.json()


def test_overview_shape_and_previous_period(client, as_role):
    data = overview(client, as_role("super_admin"))
    k = data["kpis"]
    assert k["collected"] > 0 and k["billed"] > 0 and k["visits"] >= 1
    assert 0 <= k["noShowRate"] <= 1 and 0 < k["chairUtilisation"] <= 1
    assert set(data["previous"]) == set(k) and data["previousRange"]["to"] < data["range"]["from"]
    assert data["range"]["granularity"] == "month" and len(data["trend"]) >= 3
    assert abs(sum(t["collected"] for t in data["trend"]) - k["collected"]) < 0.01
    assert data["topProcedures"] and data["paymentMethods"]


def test_revenue_by_dentist_adds_up(client, as_role):
    data = overview(client, as_role("super_admin"))
    total = sum(d["collected"] for d in data["byDentist"])
    assert abs(total - data["kpis"]["collected"]) < 0.01
    smith = next(d for d in data["byDentist"] if d["dentistId"] == "s1")
    assert smith["collected"] > 0 and smith["availableHours"] > 0


def test_clinic_scope_and_dentist_view(client, as_role):
    all_ = overview(client, as_role("super_admin"))["kpis"]["collected"]
    central = overview(client, as_role("super_admin"), clinicId=CENTRAL)["kpis"]["collected"]
    westside = overview(client, as_role("super_admin"), clinicId=WESTSIDE)["kpis"]["collected"]
    assert abs(central + westside - all_) < 0.01

    admin = as_role("admin")  # Westside admin
    assert abs(overview(client, admin)["kpis"]["collected"] - westside) < 0.01
    assert client.get(f"{API}/analytics/overview", headers=admin, params={"clinicId": CENTRAL}).status_code == 403

    mine = overview(client, as_role("dentist"), dentistId="s3")  # forced to their own numbers
    assert {d["dentistId"] for d in mine["byDentist"]} <= {"s1"}
    assert client.get(f"{API}/analytics/overview", headers=as_role("receptionist")).status_code == 403


def test_no_show_and_short_ranges(client, as_role):
    a = as_role("super_admin")
    today = date.today()
    short = overview(client, a, **{"from": (today - timedelta(days=27)).isoformat(), "to": today.isoformat()})
    assert short["range"]["granularity"] == "week"
    bad = client.get(f"{API}/analytics/overview", headers=a, params={"from": today.isoformat(), "to": (today - timedelta(days=3)).isoformat()})
    assert bad.status_code == 400

    # A no-show yesterday shows up in the rate.
    h = as_role("receptionist")
    start = (datetime.now(timezone.utc) - timedelta(days=1)).replace(hour=5, minute=0, second=0, microsecond=0)
    before = overview(client, a, **{"from": (today - timedelta(days=6)).isoformat(), "to": today.isoformat()})["kpis"]
    appt = client.post(f"{API}/appointments", headers=h, json={
        "patientId": "pat_6", "dentistId": "s1", "clinicId": CENTRAL, "startTime": start.isoformat(),
        "endTime": (start + timedelta(minutes=30)).isoformat(), "procedureType": "Checkup", "allowOverlap": True}).json()
    client.patch(f"{API}/appointments/{appt['id']}", headers=h, json={"status": "no_show"})
    after = overview(client, a, **{"from": (today - timedelta(days=6)).isoformat(), "to": today.isoformat()})["kpis"]
    assert (after["noShowRate"] or 0) > (before["noShowRate"] or 0)


def test_new_invoices_are_credited_to_the_patients_dentist(client, as_role):
    h = as_role("receptionist")
    # pat_2 sees Dr Smith (s1) at Central.
    res = client.post(f"{API}/invoices", headers=h, json={
        "patientId": "pat_2", "lineItems": [{"procedureName": "Consultation", "quantity": 1, "unitCost": 500}],
        "dueDate": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(), "sendNow": True})
    assert res.status_code == 201, res.text
    from app.core.database import get_db
    from app.main import app
    from app.models import Invoice

    db = next(app.dependency_overrides[get_db]())
    assert db.get(Invoice, res.json()["id"]).dentist_id == "s1"
    db.close()
