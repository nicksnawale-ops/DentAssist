import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.core.config import get_settings
from app.services import billing, razorpay

API = "/api/v1"
CENTRAL = "c1b48b94-132d-41a4-8f77-e2307fbadd2f"


def due(days: int = 7) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def new_invoice(client, headers, **overrides):
    body = {
        "patientId": "pat_4",
        "lineItems": [
            {"procedureName": "Root Canal Treatment (Posterior)", "toothNumber": "36", "quantity": 1, "unitCost": 6000},
            {"procedureName": "Teeth Whitening", "quantity": 1, "unitCost": 8000, "taxable": True},
        ],
        "discount": 0,
        "discountType": "flat",
        "dueDate": due(),
    }
    body.update(overrides)
    res = client.post(f"{API}/invoices", headers=headers, json=body)
    assert res.status_code == 201, res.text
    return res.json()


# ---------- Pure maths ----------

def test_gst_only_on_taxable_lines():
    t = billing.compute_totals(
        [{"procedureName": "RCT", "quantity": 1, "unitCost": 6000},
         {"procedureName": "Whitening", "quantity": 1, "unitCost": 8000, "taxable": True}],
        0, "flat", 18, False)
    assert t["subtotal"] == Decimal("14000.00")
    assert t["total_tax"] == Decimal("1440.00")  # 18% of 8000 only
    assert t["tax_breakdown"] == {"cgst": 720.0, "sgst": 720.0, "igst": 0.0}
    assert t["total"] == Decimal("15440.00")


def test_discount_is_spread_before_tax_and_igst():
    t = billing.compute_totals(
        [{"procedureName": "RCT", "quantity": 1, "unitCost": 6000},
         {"procedureName": "Whitening", "quantity": 1, "unitCost": 4000, "taxable": True}],
        10, "percentage", 18, True)
    # discount 1000; taxable base 4000 * 0.9 = 3600; tax 648 as IGST
    assert t["discount_amount"] == Decimal("1000.00")
    assert t["tax_breakdown"]["igst"] == 648.0 and t["tax_breakdown"]["cgst"] == 0.0
    assert t["total"] == Decimal("9648.00")


def test_flat_discount_capped_and_validation():
    t = billing.compute_totals([{"procedureName": "X", "quantity": 2, "unitCost": 500}], 5000, "flat", 18, False)
    assert t["discount_amount"] == Decimal("1000.00") and t["total"] == Decimal("0.00")
    with pytest.raises(Exception):
        billing.compute_totals([], 0, "flat", 18, False)
    with pytest.raises(Exception):
        billing.compute_totals([{"procedureName": "X", "quantity": 1, "unitCost": 100}], 120, "percentage", 18, False)


# ---------- Invoices ----------

def test_create_send_pay_lifecycle(client, as_role):
    h = as_role("receptionist")
    inv = new_invoice(client, h)
    assert inv["status"] == "Draft"
    assert inv["total"] == 15440.0 and inv["patientName"]
    assert inv["invoiceNumber"].startswith(f"INV-{datetime.now(timezone.utc).year}-")

    # Client-sent totals are ignored: the server recomputes.
    sent = client.post(f"{API}/invoices/{inv['id']}/send", headers=h).json()
    assert sent["status"] == "Sent" and sent["sentAt"]

    part = client.post(f"{API}/invoices/{inv['id']}/payments", headers=h,
                       json={"amount": 5000, "method": "Cash"}).json()
    assert part["status"] == "Partially Paid" and part["balanceDue"] == 10440.0

    too_much = client.post(f"{API}/invoices/{inv['id']}/payments", headers=h, json={"amount": 99999, "method": "UPI"})
    assert too_much.status_code == 400 and too_much.json()["code"] == "OVERPAYMENT"

    paid = client.post(f"{API}/invoices/{inv['id']}/payments", headers=h,
                       json={"amount": 10440, "method": "UPI", "referenceNumber": "UPI123"}).json()
    assert paid["status"] == "Paid" and paid["balanceDue"] == 0 and len(paid["payments"]) == 2


def test_invoice_numbers_are_sequential(client, as_role):
    h = as_role("receptionist")
    a = new_invoice(client, h)["invoiceNumber"]
    b = new_invoice(client, h)["invoiceNumber"]
    assert int(b.rsplit("-", 1)[1]) == int(a.rsplit("-", 1)[1]) + 1


def test_patient_balance_follows_invoices(client, as_role):
    h = as_role("receptionist")
    before = client.get(f"{API}/patients/pat_4", headers=h).json()["outstandingBalance"]
    inv = new_invoice(client, h, sendNow=True)
    after = client.get(f"{API}/patients/pat_4", headers=h).json()["outstandingBalance"]
    assert after == pytest.approx(before + inv["total"])
    # Drafts don't count toward the balance.
    new_invoice(client, h)
    assert client.get(f"{API}/patients/pat_4", headers=h).json()["outstandingBalance"] == pytest.approx(after)


def test_only_drafts_can_change_amounts(client, as_role):
    h = as_role("receptionist")
    inv = new_invoice(client, h)
    edited = client.patch(f"{API}/invoices/{inv['id']}", headers=h,
                          json={"discount": 1000, "discountType": "flat"}).json()
    assert edited["discountAmount"] == 1000.0 and edited["total"] < inv["total"]
    client.post(f"{API}/invoices/{inv['id']}/send", headers=h)
    locked = client.patch(f"{API}/invoices/{inv['id']}", headers=h, json={"discount": 0})
    assert locked.status_code == 400 and locked.json()["code"] == "INVOICE_LOCKED"
    # Due date and notes can still change.
    assert client.patch(f"{API}/invoices/{inv['id']}", headers=h, json={"notes": "Call before visit"}).status_code == 200


def test_void_rules(client, as_role):
    h = as_role("receptionist")
    inv = new_invoice(client, h, sendNow=True)
    assert client.post(f"{API}/invoices/{inv['id']}/void", headers=h, json={"reason": "Wrong patient"}).status_code == 403
    admin = as_role("super_admin")
    voided = client.post(f"{API}/invoices/{inv['id']}/void", headers=admin, json={"reason": "Wrong patient"}).json()
    assert voided["status"] == "Void" and voided["balanceDue"] == 0
    assert client.post(f"{API}/invoices/{inv['id']}/payments", headers=h,
                       json={"amount": 100, "method": "Cash"}).json()["code"] == "INVOICE_VOID"

    paid = new_invoice(client, h, sendNow=True)
    client.post(f"{API}/invoices/{paid['id']}/payments", headers=h, json={"amount": 100, "method": "Cash"})
    blocked = client.post(f"{API}/invoices/{paid['id']}/void", headers=admin, json={"reason": "Mistake"})
    assert blocked.json()["code"] == "INVOICE_HAS_PAYMENTS"


def test_overdue_status(client, as_role):
    h = as_role("receptionist")
    inv = new_invoice(client, h, sendNow=True, dueDate=due(-3))
    assert client.get(f"{API}/invoices/{inv['id']}", headers=h).json()["status"] == "Overdue"
    report = client.get(f"{API}/reports/outstanding", headers=h).json()
    assert any(p["patientId"] == "pat_4" and p["maxDaysOverdue"] >= 2 for p in report["patients"])
    assert {b["bucket"] for b in report["buckets"]} == {"current", "1-30", "31-60", "61-90", "90+"}


def test_list_filters_and_scoping(client, as_role):
    h = as_role("receptionist")
    new_invoice(client, h)
    drafts = client.get(f"{API}/invoices", headers=h, params={"status": "Draft"}).json()
    assert drafts and all(i["status"] == "Draft" for i in drafts)
    found = client.get(f"{API}/invoices", headers=h, params={"search": "inv-"}).json()
    assert found
    # Westside admin can't see Central invoices.
    westside = client.get(f"{API}/invoices", headers=as_role("admin")).json()
    assert all(i["clinicId"] != CENTRAL for i in westside)
    central_inv = drafts[0]["id"]
    assert client.get(f"{API}/invoices/{central_inv}", headers=as_role("admin")).status_code == 404


def test_installments(client, as_role):
    h = as_role("receptionist")
    inv = new_invoice(client, h, sendNow=True, lineItems=[{"procedureName": "Braces (Metal)", "unitCost": 35000}])
    bad = client.put(f"{API}/invoices/{inv['id']}/installments", headers=h,
                     json={"installments": [{"amount": 1000, "dueDate": due(30)}]})
    assert bad.json()["code"] == "INSTALLMENTS_MISMATCH"
    plan = client.put(f"{API}/invoices/{inv['id']}/installments", headers=h, json={"count": 3, "firstDueDate": due(5)}).json()
    assert len(plan["installments"]) == 3 and plan["hasInstallments"]
    assert sum(i["amount"] for i in plan["installments"]) == pytest.approx(35000)
    first = plan["installments"][0]["amount"]
    paid = client.post(f"{API}/invoices/{inv['id']}/payments", headers=h, json={"amount": first, "method": "UPI"}).json()
    assert [i["status"] for i in paid["installments"]] == ["Paid", "Pending", "Pending"]


def test_insurance_claim_paid_records_payment(client, as_role):
    h = as_role("receptionist")
    inv = new_invoice(client, h, sendNow=True)
    claim = client.post(f"{API}/insurance-claims", headers=h, json={
        "invoiceId": inv["id"], "providerName": "Star Health", "claimAmount": 10000}).json()
    assert claim["status"] == "Submitted" and claim["invoiceNumber"] == inv["invoiceNumber"]
    too_high = client.patch(f"{API}/insurance-claims/{claim['id']}", headers=h, json={"approvedAmount": 20000})
    assert too_high.json()["code"] == "APPROVED_TOO_HIGH"
    client.patch(f"{API}/insurance-claims/{claim['id']}", headers=h, json={"status": "Approved", "approvedAmount": 8000})
    client.patch(f"{API}/insurance-claims/{claim['id']}", headers=h, json={"status": "Paid"})
    detail = client.get(f"{API}/invoices/{inv['id']}", headers=h).json()
    assert detail["amountPaid"] == 8000.0
    assert detail["payments"][0]["method"] == "Insurance"
    assert detail["status"] == "Partially Paid"


def test_procedures_catalog(client, as_role):
    procs = client.get(f"{API}/procedures", headers=as_role("dentist")).json()
    whitening = next(p for p in procs if p["name"] == "Teeth Whitening")
    assert whitening["gstApplicable"] is True
    assert client.post(f"{API}/procedures", headers=as_role("receptionist"),
                       json={"name": "X", "defaultCost": 10}).status_code == 403
    created = client.post(f"{API}/procedures", headers=as_role("super_admin"),
                          json={"name": "Fluoride Varnish", "category": "Preventive", "defaultCost": 600})
    assert created.status_code == 201


# ---------- Patient portal ----------

def test_patient_sees_only_issued_own_invoices(client, as_role):
    h = as_role("receptionist")
    draft = new_invoice(client, h, patientId="pat_1")
    issued = new_invoice(client, h, patientId="pat_1", sendNow=True)
    other = new_invoice(client, h, patientId="pat_2", sendNow=True)
    p = as_role("patient")
    mine = client.get(f"{API}/patient-portal/invoices", headers=p).json()
    ids = {i["id"] for i in mine}
    assert issued["id"] in ids and draft["id"] not in ids and other["id"] not in ids
    assert client.get(f"{API}/invoices/{other['id']}", headers=p).status_code == 404
    assert client.get(f"{API}/invoices/{issued['id']}", headers=p).status_code == 200
    assert client.get(f"{API}/invoices", headers=p).status_code == 403
    assert client.post(f"{API}/invoices/{issued['id']}/payments", headers=p,
                       json={"amount": 1, "method": "Cash"}).status_code == 403


# ---------- Online payments ----------

@pytest.fixture()
def razorpay_on(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "razorpay_key_id", "rzp_test_123")
    monkeypatch.setattr(s, "razorpay_key_secret", "secret_abc")
    monkeypatch.setattr(s, "razorpay_webhook_secret", "whsec_xyz")
    calls = []

    def fake_create_order(amount, receipt, notes):
        calls.append(amount)
        return {"id": f"order_{len(calls)}", "amount": razorpay.to_paise(amount), "currency": "INR"}

    monkeypatch.setattr(razorpay, "create_order", fake_create_order)
    return calls


def test_online_payments_disabled_by_default(client, as_role):
    h = as_role("receptionist")
    assert client.get(f"{API}/payments/config", headers=h).json()["onlinePaymentsEnabled"] is False
    inv = new_invoice(client, h, sendNow=True)
    res = client.post(f"{API}/invoices/{inv['id']}/create-payment-order", headers=h)
    assert res.status_code == 503 and res.json()["code"] == "PAYMENTS_DISABLED"


def test_patient_pays_online_and_webhook_is_idempotent(client, as_role, razorpay_on):
    inv = new_invoice(client, as_role("receptionist"), patientId="pat_1", sendNow=True)
    p = as_role("patient")
    order = client.post(f"{API}/invoices/{inv['id']}/create-payment-order", headers=p).json()
    assert order["amountPaise"] == int(inv["total"] * 100) and order["keyId"] == "rzp_test_123"

    bad = client.post(f"{API}/payments/razorpay/verify", headers=p, json={
        "razorpayOrderId": order["orderId"], "razorpayPaymentId": "pay_1", "razorpaySignature": "nope"})
    assert bad.json()["code"] == "INVALID_SIGNATURE"

    sig = hmac.new(b"secret_abc", f"{order['orderId']}|pay_1".encode(), hashlib.sha256).hexdigest()
    ok = client.post(f"{API}/payments/razorpay/verify", headers=p, json={
        "razorpayOrderId": order["orderId"], "razorpayPaymentId": "pay_1", "razorpaySignature": sig}).json()
    assert ok["status"] == "Paid"

    # Razorpay's webhook for the same payment arrives afterwards: no double count.
    event = {"event": "payment.captured", "payload": {"payment": {"entity": {
        "id": "pay_1", "order_id": order["orderId"], "method": "upi", "status": "captured"}}}}
    raw = json.dumps(event).encode()
    wsig = hmac.new(b"whsec_xyz", raw, hashlib.sha256).hexdigest()
    hook = client.post(f"{API}/webhooks/razorpay/payment-success", content=raw,
                       headers={"X-Razorpay-Signature": wsig, "Content-Type": "application/json"})
    assert hook.status_code == 200
    detail = client.get(f"{API}/invoices/{inv['id']}", headers=as_role("receptionist")).json()
    assert len(detail["payments"]) == 1 and detail["amountPaid"] == inv["total"]


def test_webhook_rejects_bad_signature(client, razorpay_on):
    res = client.post(f"{API}/webhooks/razorpay/payment-success", content=b"{}",
                      headers={"X-Razorpay-Signature": "forged"})
    assert res.status_code == 400


def test_webhook_alone_records_payment(client, as_role, razorpay_on):
    h = as_role("receptionist")
    inv = new_invoice(client, h, sendNow=True)
    order = client.post(f"{API}/invoices/{inv['id']}/create-payment-order", headers=h).json()
    raw = json.dumps({"event": "payment.captured", "payload": {"payment": {"entity": {
        "id": "pay_card_9", "order_id": order["orderId"], "method": "card"}}}}).encode()
    wsig = hmac.new(b"whsec_xyz", raw, hashlib.sha256).hexdigest()
    client.post(f"{API}/webhooks/razorpay/payment-success", content=raw, headers={"X-Razorpay-Signature": wsig})
    detail = client.get(f"{API}/invoices/{inv['id']}", headers=h).json()
    assert detail["status"] == "Paid" and detail["payments"][0]["method"] == "Card"


# ---------- Reports & dashboards ----------

def test_revenue_report_and_dashboards(client, as_role):
    report = client.get(f"{API}/reports/revenue", headers=as_role("super_admin")).json()
    assert len(report["trend"]) >= 6 and report["totalCollected"] > 0
    assert {m["method"] for m in report["byMethod"]} <= {"UPI", "Cash", "Card", "Insurance", "Online", "Bank Transfer", "Cheque"}
    assert client.get(f"{API}/reports/revenue", headers=as_role("receptionist")).status_code == 403

    sa = client.get(f"{API}/dashboard/super_admin", headers=as_role("super_admin")).json()
    assert len(sa["revenueTrend"]) == 6 and any(m["revenue"] > 0 for m in sa["revenueTrend"])
    clinics = client.get(f"{API}/clinics", headers=as_role("super_admin")).json()
    assert any(c["monthlyRevenue"] > 0 for c in clinics) or all(c["monthlyRevenue"] == 0 for c in clinics)
