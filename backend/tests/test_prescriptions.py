import base64
import os
import struct
import zlib
from datetime import date, timedelta

API = "/api/v1"
CENTRAL = "c1b48b94-132d-41a4-8f77-e2307fbadd2f"


def png_data_url(width=120, height=40) -> str:
    """A small real PNG (noisy so it doesn't compress below the minimum size)."""
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + os.urandom(width * 3) for _ in range(height))
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))
    return "data:image/png;base64," + base64.b64encode(png).decode()


def medicine(client, h, name):
    return next(m for m in client.get(f"{API}/medicines", headers=h, params={"q": name}).json() if m["name"] == name)


def item(m, **over):
    return {"medicineId": m["id"], "name": m["name"], "genericName": m["genericName"], "form": m["form"],
            "strength": m["strength"], "dosage": m["defaultDosage"], "frequency": m["defaultFrequency"],
            "durationDays": m["defaultDurationDays"], "timing": m["defaultTiming"],
            "instructions": m["defaultInstructions"], **over}


# ---------- Prescriptions ----------

def test_medicine_catalogue_is_seeded_and_searchable(client, as_role):
    h = as_role("dentist")
    meds = client.get(f"{API}/medicines", headers=h).json()
    assert len(meds) >= 10
    assert [m["name"] for m in client.get(f"{API}/medicines", headers=h, params={"q": "clavul"}).json()] == ["Augmentin"]


def test_issue_prescription_and_print_details(client, as_role):
    h = as_role("dentist")
    ibu, chx = medicine(client, h, "Ibuprofen"), medicine(client, h, "Chlorhexidine mouthwash")
    follow = (date.today() + timedelta(days=7)).isoformat()
    res = client.post(f"{API}/patients/pat_6/prescriptions", headers=h, json={
        "diagnosis": "Pericoronitis 38", "items": [item(ibu), item(chx)], "advice": "Warm saline rinses",
        "followUpDate": follow})
    assert res.status_code == 201, res.text
    rx = res.json()
    assert rx["number"].startswith("RX-") and rx["status"] == "issued" and len(rx["items"]) == 2
    assert rx["dentist"]["name"].startswith("Dr.") and rx["clinic"]["name"] and rx["patient"]["age"] > 30
    second = client.post(f"{API}/patients/pat_6/prescriptions", headers=h, json={"items": [item(chx)]}).json()
    assert int(second["number"].rsplit("-", 1)[1]) == int(rx["number"].rsplit("-", 1)[1]) + 1


def test_allergy_warning_blocks_until_acknowledged(client, as_role):
    h = as_role("dentist")
    amox = medicine(client, h, "Amoxicillin")
    warnings = client.post(f"{API}/patients/pat_1/prescriptions/check", headers=h, json={"items": [item(amox)]}).json()
    assert warnings and warnings[0]["type"] == "allergy" and "Penicillin" in warnings[0]["message"]

    blocked = client.post(f"{API}/patients/pat_1/prescriptions", headers=h, json={"items": [item(amox)]})
    assert blocked.status_code == 409 and blocked.json()["code"] == "PRESCRIPTION_WARNINGS"
    ok = client.post(f"{API}/patients/pat_1/prescriptions", headers=h,
                     json={"items": [item(amox)], "acknowledgeWarnings": True})
    assert ok.status_code == 201 and ok.json()["acknowledgedWarnings"][0]["type"] == "allergy"


def test_condition_and_duplicate_warnings(client, as_role):
    h = as_role("dentist")
    ketorol, ibu = medicine(client, h, "Ketorol DT"), medicine(client, h, "Ibuprofen")
    # pat_5 takes warfarin; pat_4 is pregnant; pat_7 is allergic to ibuprofen (and so other NSAIDs).
    w5 = client.post(f"{API}/patients/pat_5/prescriptions/check", headers=h, json={"items": [item(ketorol)]}).json()
    assert any("blood thinners" in w["message"] for w in w5)
    w4 = client.post(f"{API}/patients/pat_4/prescriptions/check", headers=h, json={"items": [item(ibu)]}).json()
    assert any("pregnan" in w["message"].lower() for w in w4)
    w7 = client.post(f"{API}/patients/pat_7/prescriptions/check", headers=h, json={"items": [item(ketorol)]}).json()
    assert any(w["type"] == "allergy" for w in w7)
    para = medicine(client, h, "Paracetamol")
    dup = client.post(f"{API}/patients/pat_6/prescriptions/check", headers=h, json={"items": [item(para), item(para)]}).json()
    assert any(w["type"] == "duplicate" for w in dup)


def test_only_dentists_prescribe_and_patients_see_their_own(client, as_role):
    para = medicine(client, as_role("dentist"), "Paracetamol")
    body = {"items": [item(para)]}
    assert client.post(f"{API}/patients/pat_1/prescriptions", headers=as_role("receptionist"), json=body).status_code == 403
    rx = client.post(f"{API}/patients/pat_1/prescriptions", headers=as_role("dentist"), json=body).json()

    mine = client.get(f"{API}/patient-portal/prescriptions", headers=as_role("patient")).json()
    assert [r["id"] for r in mine] == [rx["id"]]
    assert client.get(f"{API}/patients/pat_2/prescriptions", headers=as_role("patient")).status_code == 404

    cancelled = client.post(f"{API}/prescriptions/{rx['id']}/cancel", headers=as_role("dentist"),
                            json={"reason": "Wrong patient"}).json()
    assert cancelled["status"] == "cancelled"
    assert client.get(f"{API}/patient-portal/prescriptions", headers=as_role("patient")).json() == []


def test_frequency_and_follow_up_validation(client, as_role):
    h = as_role("dentist")
    para = medicine(client, h, "Paracetamol")
    bad = client.post(f"{API}/patients/pat_6/prescriptions", headers=h, json={"items": [item(para, frequency="thrice")]})
    assert bad.status_code == 422
    past = client.post(f"{API}/patients/pat_6/prescriptions", headers=h,
                       json={"items": [item(para)], "followUpDate": (date.today() - timedelta(days=1)).isoformat()})
    assert past.status_code == 422


def test_prescription_on_whatsapp(client, as_role):
    h = as_role("dentist")
    para = medicine(client, h, "Paracetamol")
    rx = client.post(f"{API}/patients/pat_6/prescriptions", headers=h, json={"items": [item(para)], "sendWhatsapp": True}).json()
    log = client.get(f"{API}/messaging/log", headers=as_role("receptionist"), params={"patientId": "pat_6"}).json()
    assert log[0]["kind"] == "prescription_issued"
    again = client.post(f"{API}/prescriptions/{rx['id']}/whatsapp", headers=as_role("receptionist")).json()
    assert again["status"] == "sent"


# ---------- Consent forms ----------

def template(client, h, name):
    return next(t for t in client.get(f"{API}/consent-templates", headers=h).json() if t["name"] == name)


def test_prepare_and_sign_in_clinic(client, as_role):
    h = as_role("receptionist")
    t = template(client, h, "Tooth extraction")
    form = client.post(f"{API}/patients/pat_6/consents", headers=h, json={
        "templateId": t["id"], "procedure": "Surgical extraction", "teeth": ["38"], "dentistId": "s1"}).json()
    assert form["status"] == "pending" and "38" in form["body"] and "Dr. Sarah" in form["body"]
    assert "{" not in form["body"] and form["risks"]

    no_agree = client.post(f"{API}/consents/{form['id']}/sign", headers=h,
                           json={"signature": png_data_url(), "signedByName": "Fiona Shah", "agree": False})
    assert no_agree.status_code == 400
    not_png = client.post(f"{API}/consents/{form['id']}/sign", headers=h,
                          json={"signature": "data:image/jpeg;base64," + "A" * 400, "signedByName": "Fiona", "agree": True})
    assert not_png.status_code == 400

    signed = client.post(f"{API}/consents/{form['id']}/sign", headers=h,
                         json={"signature": png_data_url(), "signedByName": "Fiona Shah", "agree": True}).json()
    assert signed["status"] == "signed" and signed["verified"] and signed["witnessName"] == "John Doe"
    assert len(signed["contentHash"]) == 64 and signed["signedVia"] == "clinic_device"
    again = client.post(f"{API}/consents/{form['id']}/sign", headers=h,
                        json={"signature": png_data_url(), "signedByName": "Fiona Shah", "agree": True})
    assert again.status_code == 400


def test_remote_link_signing(client, as_role):
    h = as_role("receptionist")
    t = template(client, h, "Root canal treatment")
    form = client.post(f"{API}/patients/pat_6/consents", headers=h, json={"templateId": t["id"], "teeth": ["46"]}).json()
    link = client.post(f"{API}/consents/{form['id']}/send-link", headers=h).json()
    assert link["whatsappStatus"] == "sent" and "/consent/" in link["url"]
    token = link["url"].rsplit("/", 1)[1]

    public = client.get(f"{API}/public/consents/{token}").json()
    assert public["title"] == "Root canal treatment" and public["patientFirstName"] == "Fiona"
    assert "signature" not in public

    ok = client.post(f"{API}/public/consents/{token}/sign",
                     json={"signature": png_data_url(), "signedByName": "Fiona Shah", "relationship": "Self", "agree": True})
    assert ok.status_code == 200 and ok.json()["status"] == "signed"
    # The link works once.
    assert client.get(f"{API}/public/consents/{token}").status_code == 404
    detail = client.get(f"{API}/consents/{form['id']}", headers=h).json()
    assert detail["signedVia"] == "remote_link" and detail["verified"] and detail["signature"].startswith("data:image/png")


def test_bad_or_replaced_links(client, as_role):
    h = as_role("receptionist")
    assert client.get(f"{API}/public/consents/not-a-real-token").status_code == 404
    t = template(client, h, "General dental treatment")
    form = client.post(f"{API}/patients/pat_6/consents", headers=h, json={"templateId": t["id"]}).json()
    first = client.post(f"{API}/consents/{form['id']}/send-link", headers=h).json()["url"].rsplit("/", 1)[1]
    second = client.post(f"{API}/consents/{form['id']}/send-link", headers=h).json()["url"].rsplit("/", 1)[1]
    assert client.get(f"{API}/public/consents/{first}").status_code == 404, "a new link replaces the old one"
    assert client.get(f"{API}/public/consents/{second}").status_code == 200
    client.post(f"{API}/consents/{form['id']}/revoke", headers=h, json={"reason": "Prepared by mistake"})
    assert client.get(f"{API}/public/consents/{second}").status_code == 404, "withdrawn forms can't be signed"


def test_patient_signs_in_portal_and_template_versions(client, as_role):
    h = as_role("receptionist")
    t = template(client, h, "Teeth whitening")
    form = client.post(f"{API}/patients/pat_1/consents", headers=h, json={"templateId": t["id"], "procedure": "In-office whitening"}).json()
    p = as_role("patient")
    pending = client.get(f"{API}/patient-portal/consents", headers=p).json()
    assert [f["id"] for f in pending] == [form["id"]] and pending[0]["signature"] is None
    signed = client.post(f"{API}/patient-portal/consents/{form['id']}/sign", headers=p,
                         json={"signature": png_data_url(), "signedByName": "Alice Green", "agree": True}).json()
    assert signed["status"] == "signed" and signed["signedVia"] == "patient_portal"

    a = as_role("super_admin")
    edited = client.put(f"{API}/consent-templates/{t['id']}", headers=a, json={
        "name": t["name"], "body": t["body"] + " Results last 6-12 months.", "risks": t["risks"]}).json()
    assert edited["version"] == t["version"] + 1
    # The signed form keeps the wording the patient saw.
    after = client.get(f"{API}/consents/{form['id']}", headers=h).json()
    assert "6-12 months" not in after["body"] and after["verified"]
    assert client.put(f"{API}/consent-templates/{t['id']}", headers=h, json={
        "name": t["name"], "body": t["body"], "risks": []}).status_code == 403
