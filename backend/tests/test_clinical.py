from datetime import datetime, timedelta, timezone

API = "/api/v1"


def item(name, cost, tooth=None, **kw):
    return {"procedureName": name, "cost": cost, "toothNumber": tooth, **kw}


# ---------- Dental chart ----------

def test_seeded_chart_and_history(client, as_role):
    chart = client.get(f"{API}/patients/pat_1/dental-chart", headers=as_role("dentist")).json()
    teeth = {r["toothNumber"]: r for r in chart["records"]}
    assert set(teeth["26"]["conditions"]) == {"Root Canal", "Crown"}
    assert teeth["26"]["history"][0]["action"] == "Crown seated"  # newest first
    assert teeth["26"]["history"][0]["dentist"].startswith("Dr. ")
    assert len(chart["perio"]) == 6 and chart["examDates"]


def test_update_tooth_records_history(client, as_role):
    h = as_role("dentist")
    res = client.put(f"{API}/patients/pat_1/dental-chart/teeth/36", headers=h,
                     json={"conditions": ["Cavity", "Healthy"], "notes": "Distal caries"})
    assert res.status_code == 200, res.text
    rec = res.json()
    assert rec["conditions"] == ["Cavity"]  # Healthy dropped when another condition is set
    assert rec["history"][0]["action"] == "Marked Cavity"
    rec = client.put(f"{API}/patients/pat_1/dental-chart/teeth/36", headers=h,
                     json={"conditions": ["Filled"], "notes": "Composite placed"}).json()
    assert rec["history"][0]["action"] == "Marked Filled; Cleared Cavity"
    assert len(rec["history"]) == 2


def test_chart_as_of_past_date(client, as_role):
    h = as_role("dentist")
    two_years_ago = (datetime.now(timezone.utc) - timedelta(days=730)).date().isoformat()
    chart = client.get(f"{API}/patients/pat_1/dental-chart", headers=h, params={"asOf": two_years_ago}).json()
    teeth = {r["toothNumber"]: r for r in chart["records"]}
    assert "16" not in teeth  # filling was placed later
    assert set(teeth["26"]["conditions"]) == {"Root Canal", "Crown"}


def test_chart_validation_and_access(client, as_role):
    h = as_role("dentist")
    assert client.put(f"{API}/patients/pat_1/dental-chart/teeth/19", headers=h,
                      json={"conditions": ["Healthy"]}).json()["code"] == "INVALID_TOOTH"
    assert client.put(f"{API}/patients/pat_1/dental-chart/teeth/11", headers=as_role("receptionist"),
                      json={"conditions": ["Healthy"]}).status_code == 403
    assert client.get(f"{API}/patients/pat_1/dental-chart", headers=as_role("receptionist")).status_code == 403
    # Westside admin can't see a Central patient's chart.
    assert client.get(f"{API}/patients/pat_1/dental-chart", headers=as_role("admin")).status_code == 404


def test_perio_exam(client, as_role):
    h = as_role("dentist")
    res = client.post(f"{API}/patients/pat_2/dental-chart/perio", headers=h, json={"readings": [
        {"toothNumber": "16", "buccal": [3, 2, 3], "lingual": [4, 3, 4], "bleedingOnProbing": True},
        {"toothNumber": "26", "buccal": [2, 2, 2], "lingual": [2, 2, 2]},
    ]})
    assert res.status_code == 201
    bad = client.post(f"{API}/patients/pat_2/dental-chart/perio", headers=h,
                      json={"readings": [{"toothNumber": "16", "buccal": [3, 2, 30], "lingual": [1, 1, 1]}]})
    assert bad.status_code == 422
    chart = client.get(f"{API}/patients/pat_2/dental-chart", headers=h).json()
    assert {p["toothNumber"] for p in chart["perio"]} == {"16", "26"}


# ---------- Treatment plans ----------

def test_plan_lifecycle_to_invoice(client, as_role):
    h = as_role("dentist")
    procs = {p["name"]: p for p in client.get(f"{API}/procedures", headers=h).json()}
    plan = client.post(f"{API}/patients/pat_2/treatment-plans", headers=h, json={
        "name": "Restore lower left",
        "items": [
            {"procedureId": procs["Composite Filling"]["id"], "toothNumber": "36", "cost": 2000},
            {"procedureId": procs["Teeth Whitening"]["id"], "cost": 8000},
        ],
        "discount": 10, "discountType": "percentage",
    }).json()
    assert plan["status"] == "Draft" and len(plan["items"]) == 2
    assert plan["items"][1]["taxable"] is True  # from the catalog
    assert plan["subtotal"] == 10000 and plan["discountAmount"] == 1000
    assert plan["estimatedTax"] == 1296.0 and plan["estimatedTotal"] == 10296.0

    # Can't record treatment before approval, or skip straight to Completed.
    first = plan["items"][0]["id"]
    assert client.patch(f"{API}/treatment-plans/{plan['id']}/items/{first}", headers=h,
                        json={"status": "Completed"}).json()["code"] == "PLAN_NOT_APPROVED"
    assert client.patch(f"{API}/treatment-plans/{plan['id']}", headers=h,
                        json={"status": "Completed"}).json()["code"] == "INVALID_TRANSITION"

    approved = client.patch(f"{API}/treatment-plans/{plan['id']}", headers=h, json={"status": "Approved"}).json()
    assert approved["status"] == "Approved" and approved["approvedAt"]
    locked = client.patch(f"{API}/treatment-plans/{plan['id']}", headers=h, json={"discount": 0})
    assert locked.json()["code"] == "PLAN_LOCKED"

    progressed = client.patch(f"{API}/treatment-plans/{plan['id']}/items/{first}", headers=h,
                              json={"status": "Completed"}).json()
    assert progressed["status"] == "In Progress" and progressed["completedCount"] == 1
    # Completing the filling wrote to tooth 36's history.
    chart = client.get(f"{API}/patients/pat_2/dental-chart", headers=h).json()
    t36 = next(r for r in chart["records"] if r["toothNumber"] == "36")
    assert t36["history"][0]["action"] == "Composite Filling completed"
    second = plan["items"][1]["id"]
    done = client.patch(f"{API}/treatment-plans/{plan['id']}/items/{second}", headers=h, json={"status": "Completed"}).json()
    assert done["status"] == "Completed"

    inv = client.post(f"{API}/treatment-plans/{plan['id']}/invoice", headers=as_role("receptionist"))
    assert inv.status_code == 201, inv.text
    inv = inv.json()
    assert inv["total"] == 10296.0 and inv["treatmentPlanId"] == plan["id"] and inv["status"] == "Draft"
    again = client.post(f"{API}/treatment-plans/{plan['id']}/invoice", headers=h)
    assert again.json()["code"] == "PLAN_ALREADY_INVOICED"


def test_plan_items_editing_and_listing(client, as_role):
    h = as_role("dentist")
    plan = client.post(f"{API}/patients/pat_2/treatment-plans", headers=h, json={
        "name": "Check-up", "items": [item("Consultation", 500)], "status": "Proposed"}).json()
    keep = plan["items"][0]["id"]
    edited = client.patch(f"{API}/treatment-plans/{plan['id']}", headers=h, json={
        "items": [{"id": keep, "procedureName": "Consultation", "cost": 600}, item("Scaling & Polishing", 1500)]}).json()
    assert [i["cost"] for i in edited["items"]] == [600, 1500] and edited["items"][0]["id"] == keep

    proposed = client.get(f"{API}/treatment-plans", headers=h, params={"status": "Proposed", "mine": True}).json()
    assert any(p["id"] == plan["id"] for p in proposed)
    assert client.post(f"{API}/patients/pat_2/treatment-plans", headers=as_role("receptionist"),
                       json={"name": "X"}).status_code == 403
    # Receptionists can read plans (for billing).
    assert client.get(f"{API}/patients/pat_2/treatment-plans", headers=as_role("receptionist")).status_code == 200


def test_empty_plan_cannot_be_approved(client, as_role):
    h = as_role("dentist")
    plan = client.post(f"{API}/patients/pat_2/treatment-plans", headers=h, json={"name": "Empty"}).json()
    assert client.patch(f"{API}/treatment-plans/{plan['id']}", headers=h,
                        json={"status": "Approved"}).json()["code"] == "PLAN_EMPTY"


def test_patient_sees_own_non_draft_plans_and_chart(client, as_role):
    p = as_role("patient")
    plans = client.get(f"{API}/patient-portal/treatment-plans", headers=p).json()
    assert plans and all(pl["patientId"] == "pat_1" and pl["status"] != "Draft" for pl in plans)
    chart = client.get(f"{API}/patient-portal/dental-chart", headers=p).json()
    assert any(r["toothNumber"] == "48" for r in chart["records"])
    assert client.get(f"{API}/patients/pat_1/dental-chart", headers=p).status_code == 403
    assert client.get(f"{API}/patients/pat_1/clinical-notes", headers=p).status_code == 403


# ---------- Clinical notes ----------

def test_notes_edit_window_and_author_only(client, as_role):
    h = as_role("dentist")
    note = client.post(f"{API}/patients/pat_1/clinical-notes", headers=h, json={
        "subjective": "Pain lower right", "assessment": "Pericoronitis 48", "plan": "Irrigation, review 1 week"}).json()
    assert note["editable"] is True and note["authorName"].startswith("Dr.")
    edited = client.patch(f"{API}/clinical-notes/{note['id']}", headers=h, json={
        "subjective": "Pain lower right for 3 days", "assessment": "Pericoronitis 48", "plan": "Irrigation"}).json()
    assert edited["subjective"].endswith("3 days")

    notes = client.get(f"{API}/patients/pat_1/clinical-notes", headers=h).json()
    old = next(n for n in notes if "Routine check-up" in n["subjective"])
    assert old["editable"] is False
    locked = client.patch(f"{API}/clinical-notes/{old['id']}", headers=h, json={"subjective": "change"})
    assert locked.json()["code"] == "NOTE_LOCKED"
    assert client.post(f"{API}/patients/pat_1/clinical-notes", headers=h, json={}).status_code == 422
