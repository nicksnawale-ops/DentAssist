from datetime import date, timedelta

from sqlalchemy import select

from app.core.database import get_db
from app.main import app

API = "/api/v1"
CENTRAL = "c1b48b94-132d-41a4-8f77-e2307fbadd2f"


def db_session():
    return next(app.dependency_overrides[get_db]())


def run(client, h, steriliser="ster_1", kind="load", packs=None, **extra):
    body = {"steriliserId": steriliser, "kind": kind, **extra}
    if kind == "load":
        body["packs"] = packs or [{"contents": "Examination kit", "count": 2}, {"contents": "Extraction kit", "count": 1}]
    res = client.post(f"{API}/sterilisation/cycles", headers=h, json=body)
    assert res.status_code == 201, res.text
    return res.json()


def finish(client, h, cycle_id, passed=True, **extra):
    body = {"passed": passed, "temperatureC": 134, "holdMinutes": 4, "chemicalIndicatorOk": True, **extra}
    return client.post(f"{API}/sterilisation/cycles/{cycle_id}/result", headers=h, json=body)


# ---------- Sterilisation ----------

def test_load_is_held_until_released_then_used_once(client, as_role):
    h = as_role("receptionist")
    run(client, h, kind="helix")  # today's test, so no warning
    test = client.get(f"{API}/sterilisation/cycles", headers=h, params={"result": "running"}).json()[0]
    assert finish(client, h, test["id"], chemicalIndicatorOk=None).status_code == 200

    cycle = run(client, h)
    assert cycle["warnings"] == [] and len(cycle["packs"]) == 3
    code = cycle["packs"][0]["code"]
    assert all(p["status"] == "awaiting_release" for p in cycle["packs"])

    early = client.post(f"{API}/sterilisation/packs/use", headers=h, json={"code": code, "patientId": "pat_1"})
    assert early.status_code == 409 and early.json()["code"] == "PACK_NOT_RELEASED"

    no_ci = client.post(f"{API}/sterilisation/cycles/{cycle['id']}/result", headers=h, json={"passed": True})
    assert no_ci.status_code == 400 and no_ci.json()["code"] == "INDICATOR_REQUIRED"
    done = finish(client, h, cycle["id"]).json()
    assert done["result"] == "passed" and all(p["status"] == "sterile" for p in done["packs"])

    used = client.post(f"{API}/sterilisation/packs/use", headers=h, json={"code": code.replace("-", "").lower(), "patientId": "pat_1"})
    assert used.status_code == 200, used.text
    assert used.json()["status"] == "used" and used.json()["patientId"] == "pat_1"
    again = client.post(f"{API}/sterilisation/packs/use", headers=h, json={"code": code, "patientId": "pat_2"})
    assert again.json()["code"] == "PACK_USED"
    traced = client.get(f"{API}/patients/pat_1/instrument-packs", headers=h).json()
    assert any(p["code"] == code and p["steriliserName"].startswith("Autoclave A") for p in traced)


def test_low_temperature_fails_and_recalls(client, as_role):
    h = as_role("receptionist")
    cycle = run(client, h, steriliser="ster_2")
    res = finish(client, h, cycle["id"], temperatureC=118).json()
    assert res["result"] == "failed" and "below" in res["failureReason"]
    assert all(p["status"] == "recalled" for p in res["packs"])
    blocked = client.post(f"{API}/sterilisation/packs/use", headers=h, json={"code": res["packs"][0]["code"], "patientId": "pat_1"})
    assert blocked.json()["code"] == "PACK_RECALLED"
    assert finish(client, h, cycle["id"]).status_code == 409  # result already recorded


def test_daily_test_warning_and_optional_block(client, as_role):
    h = as_role("receptionist")
    db = db_session()
    from app.models import SterilisationCycle

    # Remove any test from today so the rule applies.
    for c in db.scalars(select(SterilisationCycle).where(SterilisationCycle.kind == "helix")):
        c.started_at = c.started_at - timedelta(days=30)
    db.commit()
    db.close()
    assert "No passed Bowie-Dick/helix test today" in run(client, h)["warnings"]
    class_n = run(client, h, steriliser="ster_2")["warnings"]  # Class N: no air-removal test needed
    assert not any("Bowie-Dick" in w for w in class_n) and any("Service was due" in w for w in class_n)

    client.put(f"{API}/sterilisation/settings", headers=as_role("super_admin"), json={"requireDailyTest": True})
    blocked = client.post(f"{API}/sterilisation/cycles", headers=h, json={"steriliserId": "ster_1", "packs": [{"contents": "Kit"}]})
    assert blocked.status_code == 409 and blocked.json()["code"] == "DAILY_TEST_REQUIRED"


def test_failed_spore_test_recalls_since_last_good_and_lists_patients(client, as_role):
    h = as_role("receptionist")
    seeded = client.get(f"{API}/sterilisation/cycles", headers=h, params={"steriliserId": "ster_1"}).json()
    exposed_before = sum(c["packsUsed"] for c in seeded if c["kind"] == "load")
    bi = run(client, h, kind="bi_test", biLot="SPS-9001")
    finish(client, h, bi["id"], chemicalIndicatorOk=None)
    out = client.post(f"{API}/sterilisation/cycles/{bi['id']}/spore-result", headers=h, json={"passed": False}).json()
    assert out["biStatus"] == "failed" and out["recalled"] >= 1
    assert len(out["exposed"]) == exposed_before > 0
    ov = client.get(f"{API}/sterilisation/overview", headers=h).json()
    a = next(s for s in ov["sterilisers"] if s["id"] == "ster_1")
    assert not a["isActive"] and "Spore test failed" in a["outOfServiceReason"]
    assert client.post(f"{API}/sterilisation/cycles", headers=h, json={"steriliserId": "ster_1", "kind": "helix"}).status_code == 409
    # Back in service only with a service date or note, by an admin.
    sa = as_role("super_admin")
    assert client.patch(f"{API}/sterilisers/ster_1", headers=sa, json={"isActive": True}).status_code == 400
    assert client.patch(f"{API}/sterilisers/ster_1", headers=sa, json={"isActive": True, "lastServicedOn": str(date.today())}).status_code == 200


def test_expired_pack_is_refused(client, as_role):
    h = as_role("receptionist")
    packs = client.get(f"{API}/sterilisation/packs", headers=h, params={"status": "sterile"}).json()
    db = db_session()
    from app.models import InstrumentPack

    p = db.get(InstrumentPack, packs[0]["id"])
    p.expires_on = date.today() - timedelta(days=1)
    db.commit()
    db.close()
    res = client.post(f"{API}/sterilisation/packs/use", headers=h, json={"code": packs[0]["code"], "patientId": "pat_1"})
    assert res.json()["code"] == "PACK_EXPIRED"
    assert client.get(f"{API}/sterilisation/packs/lookup", headers=h, params={"code": packs[0]["code"]}).json()["status"] == "expired"


def test_register_csv_and_scoping(client, as_role):
    res = client.get(f"{API}/sterilisation/register.csv", headers=as_role("receptionist"),
                     params={"from": str(date.today() - timedelta(days=10))})
    assert res.status_code == 200 and res.text.startswith("Date,Time,Steriliser")
    assert "Autoclave A" in res.text
    # Westside admin can't run Central's steriliser.
    assert client.post(f"{API}/sterilisation/cycles", headers=as_role("admin"), json={"steriliserId": "ster_1", "kind": "helix"}).status_code in (403, 404)


# ---------- Privacy ----------

def test_patient_exports_own_data_and_staff_views_are_logged(client, as_role):
    client.get(f"{API}/patients/pat_1", headers=as_role("receptionist"))
    client.get(f"{API}/patients/pat_1", headers=as_role("receptionist"))  # throttled: one log row
    res = client.get(f"{API}/patient-portal/data-export", headers=as_role("patient"))
    assert res.status_code == 200 and "attachment" in res.headers["content-disposition"]
    data = res.json()
    assert data["patient"]["firstName" if "firstName" in data["patient"] else "first_name"] == "Alice"
    assert "appointments" in data and "password_hash" not in res.text and "storage_key" not in res.text
    views = [r for r in data["accessLog"] if r["action"] == "view"]
    assert len(views) == 1 and views[0]["userName"].startswith("John")
    # Views stay out of the general audit feed.
    feed = client.get(f"{API}/audit-logs", headers=as_role("super_admin")).json()
    assert not any(r["action"] == "view" for r in feed)


def test_portal_requests_and_withdraw_consent(client, as_role):
    p = as_role("patient")
    info = client.get(f"{API}/patient-portal/privacy", headers=p).json()
    assert info["grievanceOfficer"]["email"] and info["responseDays"] == 30
    assert client.post(f"{API}/patient-portal/data-requests", headers=p, json={"kind": "correction"}).json()["code"] == "DETAILS_REQUIRED"
    made = client.post(f"{API}/patient-portal/data-requests", headers=p, json={"kind": "erasure", "details": "Please delete"})
    assert made.status_code == 201 and made.json()["status"] == "received"
    assert client.post(f"{API}/patient-portal/data-requests", headers=p, json={"kind": "erasure"}).status_code == 409

    stop = client.post(f"{API}/patient-portal/data-requests", headers=p, json={"kind": "withdraw_consent"}).json()
    assert stop["status"] == "completed"
    assert client.get(f"{API}/patient-portal/privacy", headers=p).json()["whatsappOptIn"] is False

    sa = as_role("super_admin")
    open_rows = client.get(f"{API}/data-requests", headers=sa, params={"status": "open"}).json()
    req = next(r for r in open_rows if r["kind"] == "erasure")
    bad = client.patch(f"{API}/data-requests/{req['id']}", headers=sa, json={"status": "rejected"})
    assert bad.json()["code"] == "RESOLUTION_REQUIRED"


def test_anonymise_respects_retention(client, as_role):
    sa = as_role("super_admin")
    priv = client.get(f"{API}/patients/pat_2/privacy", headers=sa).json()
    assert priv["retention"]["canErase"] is False  # recent visit and bills
    assert client.post(f"{API}/patients/pat_2/anonymise", headers=sa, json={"confirm": "nope"}).json()["code"] == "CONFIRM_REQUIRED"
    blocked = client.post(f"{API}/patients/pat_2/anonymise", headers=sa, json={"confirm": "ERASE"})
    assert blocked.status_code == 409 and blocked.json()["code"] == "RETENTION_PERIOD"

    done = client.post(f"{API}/patients/pat_2/anonymise", headers=sa, json={"confirm": "ERASE", "overrideReason": "Court order"})
    assert done.status_code == 200, done.text
    patient = client.get(f"{API}/patients/pat_2", headers=sa).json()
    assert patient["firstName"] == "Erased" and patient["phone"] == "" and patient["email"] is None
    # Bills are still there, under the anonymous record.
    bills = client.get(f"{API}/invoices", headers=sa, params={"patientId": "pat_2"})
    assert bills.status_code == 200
    assert client.post(f"{API}/patients/pat_2/anonymise", headers=sa, json={"confirm": "ERASE", "overrideReason": "x"}).status_code == 409
    # Clinic admins can't override retention.
    assert client.post(f"{API}/patients/pat_10/anonymise", headers=as_role("admin"), json={"confirm": "ERASE", "overrideReason": "x"}).status_code == 409


def test_only_admins_export_or_see_access_log(client, as_role):
    h = as_role("receptionist")
    assert client.get(f"{API}/patients/pat_1/data-export", headers=h).status_code == 403
    assert client.get(f"{API}/patients/pat_1/access-log", headers=h).status_code == 403
    assert client.get(f"{API}/patients/pat_1/data-export", headers=as_role("super_admin")).status_code == 200
