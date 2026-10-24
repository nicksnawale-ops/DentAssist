from datetime import date, timedelta

API = "/api/v1"
CENTRAL = "c1b48b94-132d-41a4-8f77-e2307fbadd2f"
WESTSIDE = "dbbd4709-3224-4f01-b541-ef17621436dd"


def items(client, h, **params):
    return client.get(f"{API}/inventory/items", headers=h, params=params).json()


def item_named(client, h, name, clinic=CENTRAL):
    return next(i for i in items(client, h, clinicId=clinic) if i["name"] == name)


# ---------- Stock ----------

def test_summary_and_filters(client, as_role):
    h = as_role("receptionist")
    s = client.get(f"{API}/inventory/summary", headers=h).json()
    assert s["lowStock"] >= 3 and s["outOfStock"] == 1 and s["expired"] == 1 and s["expiringSoon"] >= 1
    assert s["labCasesOverdue"] == 1 and s["labCasesReadyToFit"] == 1 and s["openPurchaseOrders"] == 1
    low = items(client, h, status="low")
    assert all(i["stockStatus"] in ("low", "out") for i in low) and low
    assert all(i["clinicId"] == CENTRAL for i in items(client, h)), "front desk sees only their clinic"
    dash = client.get(f"{API}/dashboard/receptionist", headers=h).json()
    assert dash["lowInventoryItems"] == s["lowStock"] + s["outOfStock"]


def test_create_item_and_record_usage(client, as_role):
    h = as_role("receptionist")
    res = client.post(f"{API}/inventory/items", headers=h, json={
        "name": "Cotton rolls", "category": "Consumables", "unit": "packs", "reorderThreshold": 5,
        "reorderQuantity": 20, "unitCost": 45, "supplierId": "sup_1", "openingStock": 8})
    assert res.status_code == 201, res.text
    item = res.json()
    assert item["currentStock"] == 8 and item["stockStatus"] == "ok" and item["movements"][0]["type"] == "received"

    d = as_role("dentist")
    used = client.post(f"{API}/inventory/items/{item['id']}/movements", headers=d,
                       json={"change": -4, "type": "usage", "reason": "Scaling session"}).json()
    assert used["currentStock"] == 4 and used["stockStatus"] == "low"
    alerts = [n for n in client.get(f"{API}/notifications", headers=h).json() if n["title"] == "Low stock"]
    assert len(alerts) == 1 and "Cotton rolls" in alerts[0]["message"]

    # Going further down doesn't alert again until stock recovers.
    client.post(f"{API}/inventory/items/{item['id']}/movements", headers=d, json={"change": -1, "type": "usage"})
    assert len([n for n in client.get(f"{API}/notifications", headers=h).json() if n["title"] == "Low stock"]) == 1

    too_many = client.post(f"{API}/inventory/items/{item['id']}/movements", headers=d, json={"change": -50, "type": "usage"})
    assert too_many.status_code == 400 and too_many.json()["code"] == "NOT_ENOUGH_STOCK"
    assert client.post(f"{API}/inventory/items/{item['id']}/movements", headers=d,
                       json={"change": 10, "type": "received"}).status_code == 403
    wrong_sign = client.post(f"{API}/inventory/items/{item['id']}/movements", headers=h, json={"change": 5, "type": "usage"})
    assert wrong_sign.status_code == 422
    no_reason = client.post(f"{API}/inventory/items/{item['id']}/movements", headers=h, json={"change": -1, "type": "adjustment"})
    assert no_reason.status_code == 422


def test_other_clinic_items_are_hidden(client, as_role):
    westside_item = item_named(client, as_role("admin"), "Glass ionomer cement", WESTSIDE)
    assert client.get(f"{API}/inventory/items/{westside_item['id']}", headers=as_role("receptionist")).status_code == 404


# ---------- Purchase orders ----------

def test_reorder_suggestions_to_po_and_receive(client, as_role):
    h = as_role("receptionist")
    groups = client.get(f"{API}/inventory/reorder-suggestions", headers=h, params={"clinicId": CENTRAL}).json()
    apex = next(g for g in groups if g["supplierId"] == "sup_1")
    names = [i["name"] for i in apex["items"]]
    assert "Nitrile gloves (medium)" in names
    assert all(g["supplierId"] != "sup_3" or "Lidocaine 2% cartridges" not in [i["name"] for i in g["items"]] for g in groups), \
        "items already on an open order are not suggested again"

    po = client.post(f"{API}/purchase-orders/from-suggestions", headers=h, json={"clinicId": CENTRAL, "supplierId": "sup_1"}).json()
    assert po["status"] == "Draft" and po["poNumber"].startswith("PO-") and po["totalAmount"] > 0
    gloves = next(l for l in po["items"] if l["name"] == "Nitrile gloves (medium)")
    assert gloves["quantity"] == 100
    again = client.get(f"{API}/inventory/reorder-suggestions", headers=h, params={"clinicId": CENTRAL}).json()
    assert not any(g["supplierId"] == "sup_1" for g in again)

    sent = client.post(f"{API}/purchase-orders/{po['id']}/send", headers=h).json()
    assert sent["status"] == "Sent"
    before = item_named(client, h, "Nitrile gloves (medium)")["currentStock"]
    partial = client.post(f"{API}/purchase-orders/{po['id']}/receive", headers=h, json={"lines": [
        {"itemId": gloves["itemId"], "quantity": 60, "expiryDate": (date.today() + timedelta(days=700)).isoformat()}]}).json()
    assert partial["status"] == "Partially Received"
    after = item_named(client, h, "Nitrile gloves (medium)")
    assert after["currentStock"] == before + 60 and after["stockStatus"] == "ok"
    rest = [{"itemId": l["itemId"], "quantity": l["quantity"] - l["receivedQuantity"]} for l in partial["items"]]
    done = client.post(f"{API}/purchase-orders/{po['id']}/receive", headers=h, json={"lines": rest}).json()
    assert done["status"] == "Received" and done["receivedAt"]
    assert client.post(f"{API}/purchase-orders/{po['id']}/receive", headers=h, json={"lines": rest}).status_code == 400


def test_po_validation_and_permissions(client, as_role):
    h = as_role("receptionist")
    westside_item = item_named(client, as_role("admin"), "Glass ionomer cement", WESTSIDE)
    bad = client.post(f"{API}/purchase-orders", headers=h, json={
        "clinicId": CENTRAL, "supplierId": "sup_1", "items": [{"itemId": westside_item["id"], "quantity": 2}]})
    assert bad.status_code in (400, 403)
    assert client.post(f"{API}/purchase-orders", headers=as_role("dentist"), json={
        "clinicId": CENTRAL, "supplierId": "sup_1", "items": [{"itemId": "inv_1", "quantity": 2}]}).status_code == 403
    po = client.post(f"{API}/purchase-orders", headers=h, json={
        "clinicId": CENTRAL, "supplierId": "sup_1", "items": [{"itemId": "inv_1", "quantity": 2, "unitPrice": 320}]}).json()
    assert po["totalAmount"] == 640
    edited = client.put(f"{API}/purchase-orders/{po['id']}", headers=h, json={
        "supplierId": "sup_1", "items": [{"itemId": "inv_1", "quantity": 3, "unitPrice": 320}]}).json()
    assert edited["totalAmount"] == 960
    client.post(f"{API}/purchase-orders/{po['id']}/send", headers=h)
    assert client.put(f"{API}/purchase-orders/{po['id']}", headers=h, json={
        "supplierId": "sup_1", "items": [{"itemId": "inv_1", "quantity": 1}]}).status_code == 400
    assert client.post(f"{API}/purchase-orders/{po['id']}/cancel", headers=h).json()["status"] == "Cancelled"


# ---------- Lab orders ----------

def test_lab_views_and_performance(client, as_role):
    h = as_role("receptionist")
    overdue = client.get(f"{API}/lab-orders", headers=h, params={"view": "overdue"}).json()
    assert [o["itemType"] for o in overdue] == ["Aligner"] and overdue[0]["daysLate"] >= 1
    ready = client.get(f"{API}/lab-orders", headers=h, params={"view": "ready"}).json()
    assert [o["itemType"] for o in ready] == ["Bridge"]
    labs = client.get(f"{API}/suppliers", headers=h, params={"labs": "true"}).json()
    precision = next(l for l in labs if l["id"] == "lab_1")
    assert precision["performance"]["delivered"] >= 2 and precision["performance"]["averageTurnaroundDays"] > 0


def test_lab_order_lifecycle_and_patient_message(client, as_role):
    d = as_role("dentist")
    o = client.post(f"{API}/lab-orders", headers=d, json={
        "patientId": "pat_6", "labId": "lab_1", "itemType": "Crown", "toothNumbers": ["26"], "shade": "A2",
        "material": "Zirconia", "cost": 6500}).json()
    assert o["orderNumber"].startswith("LAB-") and o["status"] == "Ordered" and o["dentistId"] == "s1"
    assert o["expectedDate"] == (date.today() + timedelta(days=5)).isoformat(), "uses the lab's usual turnaround"

    h = as_role("receptionist")
    client.post(f"{API}/lab-orders/{o['id']}/status", headers=h, json={"status": "Quality Check", "note": "Glazing"})
    back = client.post(f"{API}/lab-orders/{o['id']}/status", headers=h, json={"status": "In Progress"})
    assert back.status_code == 400 and back.json()["code"] == "STATUS_BACKWARDS"
    arrived = client.post(f"{API}/lab-orders/{o['id']}/status", headers=h, json={"status": "Delivered to Clinic"}).json()
    assert arrived["deliveredAt"] and [u["status"] for u in arrived["updates"]][-1] == "Delivered to Clinic"

    note = client.get(f"{API}/notifications", headers=d).json()[0]
    assert note["title"] == "Lab work arrived"
    msg = client.get(f"{API}/messaging/log", headers=h, params={"patientId": "pat_6"}).json()[0]
    assert msg["kind"] == "lab_ready" and "crown" in msg["body"].lower()

    fitted = client.post(f"{API}/lab-orders/{o['id']}/status", headers=d, json={"status": "Fitted/Completed"}).json()
    assert fitted["fittedAt"]
    assert client.post(f"{API}/lab-orders/{o['id']}/status", headers=d, json={"status": "Cancelled"}).status_code == 400


def test_remake(client, as_role):
    h = as_role("receptionist")
    bridge = client.get(f"{API}/lab-orders", headers=h, params={"view": "ready"}).json()[0]
    new = client.post(f"{API}/lab-orders/{bridge['id']}/remake", headers=h, json={"reason": "Shade too light"}).json()
    assert new["remakeOfId"] == bridge["id"] and new["status"] == "Ordered" and "Shade too light" in new["instructions"]
    old = client.get(f"{API}/lab-orders/{bridge['id']}", headers=h).json()
    assert old["status"] == "Cancelled"
    bad = client.post(f"{API}/lab-orders", headers=h, json={"patientId": "pat_6", "labId": "sup_1", "itemType": "Crown"})
    assert bad.status_code == 400 and bad.json()["code"] == "INVALID_LAB"
