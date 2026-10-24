"""Load demo data (converted from the frontend mock files) into an empty database.

Usage (from the backend folder):
    python -m app.seed               # seed if the database is empty
    python -m app.seed --reset       # DROP all tables, recreate, then seed (destroys data!)

Every demo login uses the password in DEMO_PASSWORD (default: Demo@1234).
Never run this against a database with real patient data.
"""

import argparse
import json
import os
import random
from decimal import Decimal
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import (
    AppSetting,
    Appointment,
    Clinic,
    ClinicalNote,
    PerioReading,
    ToothEvent,
    ToothRecord,
    TreatmentPlan,
    TreatmentPlanItem,
    Installment,
    InsuranceClaim,
    Invoice,
    Notification,
    Patient,
    Procedure,
    StaffProfile,
    User,
    WaitlistEntry,
)
from app.services import billing

SEED_FILE = Path(__file__).parent / "seed_data" / "demo_seed.json"
DEFAULT_CLINIC = "c1b48b94-132d-41a4-8f77-e2307fbadd2f"
WESTSIDE_CLINIC = "dbbd4709-3224-4f01-b541-ef17621436dd"


def _dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def seed(db: Session, password: str) -> dict[str, int]:
    data = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    pw_hash = hash_password(password)

    for c in data["clinics"]:
        db.add(Clinic(
            id=c["id"], name=c["name"], address=c.get("address"), phone=c.get("phone"), email=c.get("email"),
            timezone=c.get("timezone") or "Asia/Kolkata", operating_hours=c.get("operatingHours"),
            status=c.get("status", "active"), created_at=_dt(c.get("createdAt")),
        ))
    db.flush()

    # Patients: the mocks have no clinic, so use the clinic of their first appointment (else Central Clinic).
    first_clinic: dict[str, str] = {}
    for a in data["appointments"]:
        first_clinic.setdefault(a["patientId"], a["clinicId"])
    # Patients with no appointments: pat_9 and above go to Westside so both clinics have records.
    def home_clinic(pid: str) -> str:
        if pid in first_clinic:
            return first_clinic[pid]
        return WESTSIDE_CLINIC if int(pid.split("_")[1]) >= 9 else DEFAULT_CLINIC

    for p in data["patients"]:
        db.add(Patient(
            id=p["id"], clinic_id=home_clinic(p["id"]),
            first_name=p["firstName"], last_name=p.get("lastName", ""), phone=p["phone"], email=p.get("email"),
            dob=p.get("dob"), gender=p.get("gender"), address=p.get("address"),
            communication_prefs=p.get("communicationPrefs"), emergency_contact=p.get("emergencyContact"),
            medical_history=p.get("medicalHistory"), dental_history=p.get("dentalHistory"),
            insurance=p.get("insurance"), referral_source=p.get("referralSource"), tags=p.get("tags", []),
            last_visit=p.get("lastVisit"), outstanding_balance=0,  # recalculated from invoices below
            created_at=_dt(p.get("createdAt")) or datetime.now(timezone.utc),
        ))
    db.flush()

    sa = data["superAdmin"]
    users = [User(id=sa["id"], email=sa["email"], password_hash=pw_hash, first_name=sa["firstName"],
                  last_name=sa["lastName"], role="super_admin", created_at=_dt(sa.get("createdAt")))]
    for s in data["staff"]:
        u = User(id=s["id"], email=s["email"], password_hash=pw_hash, first_name=s["firstName"],
                 last_name=s["lastName"], role=s["role"], clinic_id=s.get("clinicId"), phone=s.get("phone"),
                 created_at=_dt(s.get("createdAt")))
        u.staff_profile = StaffProfile(
            clinic_ids=s.get("clinicIds") or [s.get("clinicId")], status=s.get("status", "active"),
            specializations=s.get("specializations", []), license_number=s.get("licenseNumber"),
            working_hours=s.get("workingHours"), date_joined=_dt(s.get("dateJoined")),
        )
        users.append(u)
    pl = data["patientLogin"]
    linked = next(p for p in data["patients"] if p["id"] == pl["patientId"])
    users.append(User(id=pl["id"], email=pl["email"], password_hash=pw_hash, first_name=linked["firstName"],
                      last_name=linked.get("lastName", ""), role="patient", clinic_id=pl.get("clinicId"),
                      patient_id=pl["patientId"], phone=linked.get("phone"), created_at=_dt(pl.get("createdAt"))))
    db.add_all(users)
    db.flush()

    # Appointments are placed in the current week (Mon = dayOffset 0) in clinic local time.
    tz = ZoneInfo("Asia/Kolkata")
    today = datetime.now(tz).date()
    monday = today - timedelta(days=today.weekday())
    for a in data["appointments"]:
        day = monday + timedelta(days=a["dayOffset"])
        start = datetime.combine(day, time.fromisoformat(a["start"]), tzinfo=tz).astimezone(timezone.utc)
        end = datetime.combine(day, time.fromisoformat(a["end"]), tzinfo=tz).astimezone(timezone.utc)
        db.add(Appointment(id=a["id"], patient_id=a["patientId"], dentist_id=a["dentistId"], clinic_id=a["clinicId"],
                           start_time=start, end_time=end, status=a["status"], procedure_type=a["procedureType"],
                           notes=a.get("notes")))

    for w in data["waitlist"]:
        db.add(WaitlistEntry(**{
            "id": w["id"], "patient_id": w["patientId"], "preferred_dentist_id": w.get("preferredDentistId"),
            "preferred_date_range": w.get("preferredDateRange", ""), "clinic_id": w["clinicId"],
            "status": w.get("status", "waiting"),
        }))

    # Give every login its own copy of the demo notifications (read state is per user).
    now = datetime.now(timezone.utc)
    for u in users:
        for i, n in enumerate(data["notifications"]):
            db.add(Notification(user_id=u.id, title=n["title"], message=n["message"], is_read=n.get("isRead", False),
                                created_at=now - timedelta(hours=i * 3)))

    db.add(AppSetting(key="permissions", value=data["permissions"]))
    db.add(AppSetting(key="subscription", value=data["subscription"]))

    for pr in data["procedures"]:
        db.add(Procedure(id=pr["id"], name=pr["name"], category=pr["category"], default_cost=pr["defaultCost"],
                         default_duration_minutes=pr["defaultDurationMinutes"], gst_applicable=pr["gstApplicable"]))
    db.flush()
    invoice_count = seed_invoices(db, data, home_clinic, users[0])
    seed_clinical(db, data, home_clinic)
    seed_history(db)
    from app.services.consents import seed_templates
    from app.services.prescriptions import seed_medicines

    seed_medicines(db)
    seed_templates(db)
    seed_inventory(db)
    seed_team(db)
    seed_family(db)
    seed_leads(db)
    seed_compliance(db)
    db.commit()
    return {"clinics": len(data["clinics"]), "users": len(users), "patients": len(data["patients"]),
            "appointments": len(data["appointments"]), "invoices": invoice_count}


def seed_invoices(db: Session, data: dict, home_clinic, actor: User) -> int:
    """Six months of realistic billing so revenue charts and balances have something to show."""
    rng = random.Random(42)  # same demo data every time
    procs = data["procedures"]
    by_clinic: dict[str, list[str]] = {}
    for p in data["patients"]:
        by_clinic.setdefault(home_clinic(p["id"]), []).append(p["id"])

    now = datetime.now(timezone.utc)
    count = 0

    def make(patient_id, clinic_id, created, lines, *, send=True, pay_ratio=1.0, method="UPI", due_days=7):
        nonlocal count
        totals = billing.compute_totals(lines, 0, "flat", 18, False)
        dentist = ("s3" if count % 3 == 2 else "s1") if clinic_id == DEFAULT_CLINIC else "s3"
        inv = Invoice(invoice_number=billing.next_invoice_number(db, created), patient_id=patient_id,
                      clinic_id=clinic_id, due_date=created + timedelta(days=due_days), created_by_id=actor.id,
                      dentist_id=dentist,
                      status="Sent" if send else "Draft", sent_at=created if send else None, **totals)
        inv.created_at = created
        db.add(inv)
        db.flush()
        if pay_ratio > 0:
            amount = billing.money(inv.total * Decimal(str(pay_ratio)))
            billing.record_payment(db, inv, amount, method, actor, reference=f"DEMO-{count:04d}",
                                   paid_at=min(now, created + timedelta(days=rng.randint(0, 4))))
        else:
            billing.refresh_invoice(db, inv)
        count += 1
        return inv

    def line(pr, tooth=None):
        return {"procedureId": pr["id"], "procedureName": pr["name"], "toothNumber": tooth, "quantity": 1,
                "unitCost": pr["defaultCost"], "taxable": pr["gstApplicable"]}

    everyday = [p for p in procs if p["defaultCost"] <= 10000]
    for months_back in range(5, -1, -1):
        month_start = (now.replace(day=1) - timedelta(days=30 * months_back)).replace(day=1, hour=10, minute=0,
                                                                                    second=0, microsecond=0)
        for clinic_id, patients in by_clinic.items():
            for _ in range(rng.randint(4, 7) + (5 - months_back)):  # gentle growth month on month
                created = month_start + timedelta(days=rng.randint(0, 26), hours=rng.randint(0, 7))
                if created > now:
                    created = now - timedelta(hours=rng.randint(1, 48))
                picks = [line(rng.choice(everyday), str(rng.choice([11, 16, 21, 26, 36, 46]))) for _ in range(rng.randint(1, 2))]
                recent = months_back == 0
                ratio = rng.choice([1.0, 1.0, 1.0, 0.5, 0.0]) if recent else (1.0 if rng.random() > 0.08 else 0.0)
                make(rng.choice(patients), clinic_id, created, picks, pay_ratio=ratio,
                     method=rng.choice(["UPI", "UPI", "UPI", "Cash", "Card"]))

    # An orthodontic case on a 4-part payment plan, first part paid.
    braces = next(p for p in procs if p["name"] == "Braces (Metal)")
    ortho = make("pat_3", home_clinic("pat_3"), now - timedelta(days=75), [line(braces)], pay_ratio=0.0, due_days=120)
    first_due = now - timedelta(days=45)
    for n in range(4):
        db.add(Installment(invoice_id=ortho.id, installment_number=n + 1, amount=billing.money(Decimal(ortho.total) / 4),
                           due_date=first_due + timedelta(days=30 * n)))
    db.flush()
    billing.record_payment(db, ortho, billing.money(Decimal(ortho.total) / 4), "Card", actor, reference="DEMO-ORTHO-1",
                           paid_at=first_due)

    # An invoice partly covered by insurance that is still being processed.
    rct = next(p for p in procs if p["name"] == "Root Canal Treatment (Posterior)")
    crown = next(p for p in procs if p["name"] == "PFM Crown")
    insured = make("pat_2", home_clinic("pat_2"), now - timedelta(days=12), [line(rct, "36"), line(crown, "36")],
                   pay_ratio=0.0, due_days=30)
    db.add(InsuranceClaim(invoice_id=insured.id, patient_id="pat_2", provider_name="HDFC Ergo Health",
                          policy_number="HE-2291-77", claim_amount=billing.money(Decimal(insured.total) * Decimal("0.8")),
                          status="Under Review", submitted_at=now - timedelta(days=10)))

    # A draft waiting to be sent.
    whitening = next(p for p in procs if p["name"] == "Teeth Whitening")
    make("pat_1", home_clinic("pat_1"), now - timedelta(hours=3), [line(whitening)], send=False, pay_ratio=0.0)
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reset", action="store_true", help="drop and recreate all tables first (destroys data)")
    args = parser.parse_args()

    import app.models  # noqa: F401

    if args.reset:
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    password = os.environ.get("DEMO_PASSWORD", "Demo@1234")
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)):
            print("Database already has users; nothing seeded. Use --reset to wipe and reseed.")
            return
        counts = seed(db, password)
    print(f"Seeded {counts}. Demo logins use password: {password}")


if __name__ == "__main__":
    main()


def seed_clinical(db: Session, data: dict, home_clinic) -> None:
    """A believable dental history for Alice (pat_1) and Charlie (pat_3)."""
    now = datetime.now(timezone.utc)
    days = lambda n: now - timedelta(days=n)  # noqa: E731
    procs = {p["name"]: p for p in data["procedures"]}

    def tooth(patient, number, conditions, notes, events):
        db.add(ToothRecord(patient_id=patient, tooth_number=number, conditions=conditions, notes=notes,
                           updated_by_id=events[-1][2], updated_at=events[-1][0]))
        for when, action, author, conds in events:
            db.add(ToothEvent(patient_id=patient, tooth_number=number, action=action, conditions=conds, notes=notes,
                              author_id=author, created_at=when))

    tooth("pat_1", "11", ["Healthy"], "", [(days(540), "Routine examination", "s1", ["Healthy"])])
    tooth("pat_1", "16", ["Filled"], "Composite, occlusal", [(days(720), "Filling placed", "s1", ["Filled"])])
    tooth("pat_1", "26", ["Root Canal", "Crown"], "PFM crown, margins sound", [
        (days(1100), "Root canal treatment completed", "s3", ["Root Canal"]),
        (days(1070), "Crown seated", "s3", ["Root Canal", "Crown"]),
    ])
    tooth("pat_1", "48", ["Extraction Planned"], "Partially impacted, intermittent pain", [
        (days(240), "Evaluated for extraction", "s1", ["Extraction Planned"]),
    ])
    tooth("pat_3", "36", ["Cavity"], "Early occlusal caries, monitor", [(days(60), "Marked Cavity", "s3", ["Cavity"])])

    # Two periodontal exams for Alice: bleeding and deeper pockets a year ago, better now.
    for when, deep, bleed in ((days(365), 4, True), (days(120), 3, False)):
        for t in ("16", "11", "26", "36", "31", "46"):
            db.add(PerioReading(patient_id="pat_1", tooth_number=t,
                                measurement_points={"buccal": [deep - 1, 2, deep - 1], "lingual": [deep, deep - 1, deep]},
                                bleeding_on_probing=bleed and t in ("16", "46"), recorded_by_id="s1", recorded_at=when))

    def plan(patient, name, status, items, discount=0, dtype="flat", reason=None, created=30, approved=None, author="s1"):
        p = TreatmentPlan(patient_id=patient, clinic_id=home_clinic(patient), name=name, status=status,
                          discount=discount, discount_type=dtype, discount_reason=reason, created_by_id=author,
                          approved_at=days(approved) if approved is not None else None)
        p.created_at = days(created)
        p.items = [
            TreatmentPlanItem(procedure_id=procs[n]["id"], procedure_name=n, tooth_number=t, cost=procs[n]["defaultCost"],
                              taxable=procs[n]["gstApplicable"], status=st, sort_order=i,
                              completed_at=days(5) if st == "Completed" else None)
            for i, (n, t, st) in enumerate(items)
        ]
        db.add(p)
        return p

    plan("pat_1", "Phase 1: restorative work", "In Progress", [
        ("Scaling & Polishing", None, "Completed"),
        ("Composite Filling", "16", "Scheduled"),
        ("Root Canal Treatment (Posterior)", "26", "Pending"),
        ("PFM Crown", "26", "Pending"),
    ], discount=10, dtype="percentage", reason="Long-standing patient", created=40, approved=38)
    plan("pat_1", "Extraction and implant, lower right", "Proposed", [
        ("Surgical Extraction", "48", "Pending"),
        ("Implant Placement", "46", "Pending"),
        ("Implant Crown", "46", "Pending"),
    ], created=6)
    ortho = plan("pat_3", "Orthodontic treatment", "In Progress", [
        ("Orthodontic Consultation", None, "Completed"),
        ("Braces (Metal)", None, "Scheduled"),
    ], created=80, approved=76, author="s3")
    db.flush()
    braces_invoice = next((i for i in db.scalars(select(Invoice).where(Invoice.patient_id == "pat_3"))
                           if any(li["procedureName"] == "Braces (Metal)" for li in i.line_items)), None)
    if braces_invoice:
        ortho.invoice_id = braces_invoice.id
        braces_invoice.treatment_plan_id = ortho.id

    notes = [
        ("pat_1", "s1", 21, "Sensitivity upper left when drinking cold water. No pain on chewing.",
         "Existing composite on 26 with marginal leakage. Percussion negative. Cold test positive, lingering.",
         "Reversible pulpitis, 26, from failing restoration.",
         "Replace restoration on 26; discussed crown if defect is large. Patient agreed. Review in 2 weeks."),
        ("pat_1", "s1", 400, "Routine check-up and cleaning. No complaints.",
         "Fair oral hygiene. Mild calculus lower anterior lingual. No new caries on bitewings.",
         "Mild gingivitis. Caries-free.",
         "Scaling and polishing done. Flossing technique shown. Recall in 6 months."),
        ("pat_3", "s3", 80, "Parent reports crowded lower teeth, wants orthodontic opinion.",
         "Mixed dentition, Class I molars. Anterior crowding, overjet 4 mm, overbite 3 mm. No active decay.",
         "Class I malocclusion with anterior crowding.",
         "Records taken (OPG, ceph, photos). Plan to present fixed metal braces, 18 to 24 months."),
    ]
    for patient, author, ago, s_, o, a, p in notes:
        db.add(ClinicalNote(patient_id=patient, author_id=author, subjective=s_, objective=o, assessment=a, plan=p,
                            created_at=days(ago), updated_at=days(ago)))


# Past visits over the last year, so recalls and analytics have something to show.
HISTORY = [
    # patient, dentist, clinic, days ago, status, procedure, minutes
    ("pat_2", "s1", DEFAULT_CLINIC, 200, "completed", "Checkup", 30),
    ("pat_3", "s3", DEFAULT_CLINIC, 150, "completed", "Teeth Cleaning", 45),
    ("pat_4", "s1", DEFAULT_CLINIC, 95, "completed", "Consultation", 30),
    ("pat_5", "s1", DEFAULT_CLINIC, 400, "completed", "Composite Filling", 45),
    ("pat_5", "s1", DEFAULT_CLINIC, 215, "completed", "Checkup", 30),
    ("pat_6", "s1", DEFAULT_CLINIC, 190, "completed", "Teeth Cleaning", 45),
    ("pat_7", "s1", DEFAULT_CLINIC, 260, "completed", "Checkup", 30),
    ("pat_8", "s1", DEFAULT_CLINIC, 175, "completed", "Composite Filling", 45),
    ("pat_8", "s1", DEFAULT_CLINIC, 60, "no_show", "Checkup", 30),
    ("pat_9", "s3", WESTSIDE_CLINIC, 230, "completed", "Checkup", 30),
    ("pat_10", "s3", WESTSIDE_CLINIC, 120, "completed", "Scaling & Polishing", 45),
    ("pat_10", "s3", WESTSIDE_CLINIC, 45, "cancelled", "Follow-up", 30),
    ("pat_11", "s3", WESTSIDE_CLINIC, 300, "completed", "Root Canal Treatment (Posterior)", 90),
    ("pat_12", "s3", WESTSIDE_CLINIC, 30, "completed", "Checkup", 30),
    ("pat_13", "s3", WESTSIDE_CLINIC, 80, "no_show", "Consultation", 30),
    ("pat_14", "s3", WESTSIDE_CLINIC, 210, "completed", "Teeth Cleaning", 45),
]


def seed_history(db: Session) -> None:
    tz = ZoneInfo("Asia/Kolkata")
    today = datetime.now(tz).date()
    for i, (pid, dentist, clinic, ago, status, proc, minutes) in enumerate(HISTORY, start=1):
        start = datetime.combine(today - timedelta(days=ago), time(10 + i % 6, 0), tzinfo=tz).astimezone(timezone.utc)
        end = start + timedelta(minutes=minutes)
        db.add(Appointment(id=f"hist_{i}", patient_id=pid, dentist_id=dentist, clinic_id=clinic, start_time=start,
                           end_time=end, status=status, procedure_type=proc, created_at=start - timedelta(days=7),
                           updated_at=end))
    central = db.get(Clinic, DEFAULT_CLINIC)
    if central:
        # Demo link; replace with the clinic's real Google review link in its settings.
        central.google_review_url = "https://g.page/r/visionedge-central-demo/review"


SUPPLIERS = [
    ("sup_1", "Apex Dental Supplies", "Rahul Sharma", "+91 98765 01111", "rahul@apexdental.in", "123 Industrial Area, Phase 1, Mumbai",
     "Primary supplier for consumables and PPE.", ["Consumables", "PPE"], False, None),
    ("sup_2", "Mediquip Instruments", "Priya Patel", "+91 98765 02222", "sales@mediquip.in", "45 Tech Park, Bangalore",
     "Dental instruments and equipment parts.", ["Instruments", "Equipment"], False, None),
    ("sup_3", "PharmaCare Solutions", "Amit Kumar", "+91 98765 03333", "orders@pharmacare.in", "78 Pharma Hub, Hyderabad",
     "Local distributor for medicines and anaesthetics.", ["Medications"], False, None),
    ("lab_1", "Precision Dental Lab", "Sanjay Gupta", "+91 98765 04444", "info@precisiondentallab.in", "12 Lab Street, Andheri, Mumbai",
     "Zirconia and PFM crowns, bridges, veneers.", ["Crown", "Bridge", "Veneer"], True, 5),
    ("lab_2", "Perfect Align Labs", "Meera Reddy", "+91 98765 05555", "orders@perfectalign.in", "56 Ortho Avenue, Pune",
     "Clear aligners, retainers and night guards.", ["Aligner", "Night Guard", "Retainer"], True, 8),
]

STOCK = [
    # clinic, name, category, unit, stock, threshold, reorder qty, unit cost, supplier, expiry in days
    (DEFAULT_CLINIC, "Nitrile gloves (medium)", "PPE", "boxes", 45, 50, 100, 320, "sup_1", None),
    (DEFAULT_CLINIC, "Composite resin A2", "Consumables", "syringes", 12, 10, 20, 850, "sup_1", 180),
    (DEFAULT_CLINIC, "Lidocaine 2% cartridges", "Medications", "boxes of 50", 5, 15, 20, 1450, "sup_3", 15),
    (DEFAULT_CLINIC, "Sterilisation pouches (medium)", "Consumables", "pouches", 150, 100, 500, 4, "sup_1", None),
    (DEFAULT_CLINIC, "Amoxicillin 500 mg", "Medications", "strips", 2, 20, 40, 60, "sup_3", -5),
    (DEFAULT_CLINIC, "High-speed burs", "Instruments", "pieces", 120, 50, 100, 95, "sup_2", None),
    (DEFAULT_CLINIC, "Face masks (3-ply)", "PPE", "boxes", 30, 20, 50, 180, "sup_1", None),
    (DEFAULT_CLINIC, "Alginate impression material", "Consumables", "packs", 8, 6, 12, 650, "sup_1", 240),
    (DEFAULT_CLINIC, "Endo files K-type 25mm", "Instruments", "packs", 0, 5, 10, 420, "sup_2", None),
    (WESTSIDE_CLINIC, "Nitrile gloves (medium)", "PPE", "boxes", 80, 40, 100, 320, "sup_1", None),
    (WESTSIDE_CLINIC, "Lidocaine 2% cartridges", "Medications", "boxes of 50", 18, 10, 20, 1450, "sup_3", 120),
    (WESTSIDE_CLINIC, "Glass ionomer cement", "Consumables", "kits", 3, 4, 6, 1900, "sup_1", 300),
]


def seed_inventory(db: Session) -> None:
    from decimal import Decimal as D

    from app.models import InventoryItem, LabOrder, LabOrderUpdate, PurchaseOrder, StockMovement, Supplier

    now = datetime.now(timezone.utc)
    today = now.date()
    for sid, name, contact, phone, email, address, notes, items, is_lab, tat in SUPPLIERS:
        db.add(Supplier(id=sid, name=name, contact_person=contact, phone=phone, email=email, address=address, notes=notes,
                        items_supplied=items, is_lab=is_lab, turnaround_days=tat))
    db.flush()
    lidocaine = None
    for i, (clinic, name, cat, unit, stock, threshold, qty, cost, sup, expiry) in enumerate(STOCK, start=1):
        item = InventoryItem(id=f"inv_{i}", clinic_id=clinic, name=name, category=cat, unit=unit, current_stock=stock,
                             reorder_threshold=threshold, reorder_quantity=qty, unit_cost=D(cost), supplier_id=sup,
                             expiry_date=today + timedelta(days=expiry) if expiry is not None else None,
                             last_restocked_at=now - timedelta(days=30),
                             low_stock_alerted_at=now - timedelta(days=2) if stock <= threshold else None)
        db.add(item)
        db.add(StockMovement(item_id=item.id, clinic_id=clinic, change=stock + 10, balance_after=stock + 10, type="received",
                             reason="Opening stock", recorded_at=now - timedelta(days=30)))
        db.add(StockMovement(item_id=item.id, clinic_id=clinic, change=-10, balance_after=stock, type="usage",
                             reason="Used in treatments", recorded_at=now - timedelta(days=3)))
        if name.startswith("Lidocaine") and clinic == DEFAULT_CLINIC:
            lidocaine = item
    year = today.year
    if lidocaine:
        db.add(PurchaseOrder(po_number=f"PO-{year}-0001", clinic_id=DEFAULT_CLINIC, supplier_id="sup_2", status="Received",
                             items=[{"itemId": "inv_6", "name": "High-speed burs", "unit": "pieces", "quantity": 100,
                                     "unitPrice": 95.0, "receivedQuantity": 100}],
                             total_amount=D("9500"), sent_at=now - timedelta(days=35), received_at=now - timedelta(days=30)))
        db.add(PurchaseOrder(po_number=f"PO-{year}-0002", clinic_id=DEFAULT_CLINIC, supplier_id="sup_3", status="Sent",
                             items=[{"itemId": lidocaine.id, "name": lidocaine.name, "unit": lidocaine.unit, "quantity": 20,
                                     "unitPrice": 1450.0, "receivedQuantity": 0}],
                             total_amount=D("29000"), sent_at=now - timedelta(days=1), expected_date=today + timedelta(days=3)))

    cases = [
        # patient, clinic, lab, dentist, item, teeth, shade, material, status, ordered days ago, due in days, delivered days ago, cost
        ("pat_1", DEFAULT_CLINIC, "lab_1", "s1", "Crown", ["16"], "A2", "Zirconia", "Ready for Pickup", 6, 1, None, 6500),
        ("pat_2", DEFAULT_CLINIC, "lab_2", "s1", "Aligner", [], "", "Clear aligner set 1-6", "In Progress", 10, -1, None, 28000),
        ("pat_3", DEFAULT_CLINIC, "lab_1", "s3", "Bridge", ["14", "15", "16"], "A1", "PFM", "Delivered to Clinic", 12, -2, 3, 15000),
        ("pat_5", DEFAULT_CLINIC, "lab_1", "s1", "Crown", ["36"], "A3", "Zirconia", "Fitted/Completed", 60, -55, 54, 6500),
        ("pat_6", DEFAULT_CLINIC, "lab_1", "s1", "Veneer", ["11", "21"], "BL2", "E-max", "Fitted/Completed", 90, -84, 82, 18000),
        ("pat_9", WESTSIDE_CLINIC, "lab_2", "s3", "Night Guard", [], "", "Hard acrylic", "Fitted/Completed", 40, -32, 29, 4500),
        ("pat_11", WESTSIDE_CLINIC, "lab_1", "s3", "Crown", ["46"], "A2", "PFM", "Fitted/Completed", 120, -114, 110, 5500),
    ]
    for n, (pid, clinic, lab, dentist, item, teeth, shade, material, status, ago, due, delivered, cost) in enumerate(cases, start=1):
        o = LabOrder(id=f"lo_{n}", order_number=f"LAB-{year}-{n:04d}", clinic_id=clinic, patient_id=pid, lab_id=lab,
                     dentist_id=dentist, item_type=item, tooth_numbers=teeth, shade=shade, material=material, status=status,
                     order_date=today - timedelta(days=ago), expected_date=today + timedelta(days=due),
                     delivered_at=now - timedelta(days=delivered) if delivered is not None else None,
                     fitted_at=now - timedelta(days=max((delivered or 0) - 2, 0)) if status == "Fitted/Completed" else None,
                     cost=D(cost))
        db.add(o)
        flow = ["Ordered", "In Progress", "Quality Check", "Ready for Pickup", "Delivered to Clinic", "Fitted/Completed"]
        for k, st in enumerate(flow[: flow.index(status) + 1]):
            db.add(LabOrderUpdate(lab_order_id=o.id, status=st, note="" if k else "Sent to lab",
                                  created_at=now - timedelta(days=max(ago - k * 2, 0))))


def seed_team(db: Session) -> None:
    """Pay rules for the two dentists and a few weeks of attendance."""
    from decimal import Decimal as D

    from app.models import AttendanceRecord, CompensationPlan

    db.add(CompensationPlan(staff_id="s1", clinic_id=DEFAULT_CLINIC, arrangement="associate", basis="collections",
                            percent=D("40"), lab_share_percent=D("50"), minimum_guarantee=D("40000"), tds_percent=D("10"),
                            notes="Associate: 40% of collections, half of lab bills, ₹40,000 minimum"))
    db.add(CompensationPlan(staff_id="s3", clinic_id=None, arrangement="consultant", basis="collections",
                            percent=D("50"), lab_share_percent=D("100"), tds_percent=D("10"),
                            notes="Visiting endodontist: 50% of collections after lab costs"))
    tz = ZoneInfo("Asia/Kolkata")
    today = datetime.now(tz).date()
    rng = random.Random(7)
    for staff_id, start_hour in (("s1", 9), ("s2", 9), ("s3", 10)):
        for back in range(1, 26):
            day = today - timedelta(days=back)
            if day.weekday() == 6:
                continue
            roll = rng.random()
            if roll < 0.05:
                db.add(AttendanceRecord(staff_id=staff_id, clinic_id=DEFAULT_CLINIC, day=day, status="leave", source="admin",
                                        note="Planned leave"))
                continue
            late = rng.choice([0, 0, 0, 0, 5, 18, 32])
            cin = datetime.combine(day, time(start_hour, 0), tzinfo=tz) + timedelta(minutes=late)
            cout = cin + timedelta(hours=8 if roll > 0.15 else 4, minutes=rng.randint(0, 40))
            db.add(AttendanceRecord(staff_id=staff_id, clinic_id=DEFAULT_CLINIC, day=day,
                                    status="present" if roll > 0.15 else "half_day", check_in_at=cin.astimezone(timezone.utc),
                                    check_out_at=cout.astimezone(timezone.utc), late_minutes=late if late > 10 else 0))


def seed_family(db: Session) -> None:
    """Nina and Omar share a phone: put them in one family (Nina is the account holder)."""
    from app.models import Family, Patient

    fam = Family(id="fam_1", name="Nina's family", head_patient_id="pat_14", clinic_id=WESTSIDE_CLINIC)
    db.add(fam)
    db.flush()
    for pid, rel in (("pat_14", "Self"), ("pat_15", "Spouse")):
        p = db.get(Patient, pid)
        if p:
            p.family_id, p.family_relation = fam.id, rel
    central = db.get(Clinic, DEFAULT_CLINIC)
    if central:
        central.checkin_token = "demo-central-checkin-key"


def seed_leads(db: Session) -> None:
    """A realistic month of enquiries at Central: every stage of the pipeline and the main sources."""
    from app.models import AppSetting, Lead, LeadActivity

    now = datetime.now(timezone.utc)
    rows = [
        # id, name, phone, source, interest, status, days ago, contacted, value, extra
        ("lead_1", "Rohan Kulkarni", "919822011001", "instagram", "Braces / aligners", "new", 0.01, False, 65000, {}),
        ("lead_2", "Sneha Patil", "919822011002", "website", "Implants", "new", 0.2, False, 45000, {"msg": "Missing lower molar, what is the cost?"}),
        ("lead_3", "Amit Deshmukh", "919822011003", "google", "Root canal", "contacted", 2, True, 8000, {}),
        ("lead_4", "Pooja Joshi", "919822011004", "whatsapp", "Teeth whitening", "contacted", 4, True, 12000, {"overdue": True}),
        ("lead_5", "Vikram Shinde", "919822011005", "facebook", "Smile makeover", "consult_booked", 6, True, 150000, {}),
        ("lead_6", "Meera Iyer", "919822011006", "referral", "Kids dentistry", "won", 12, True, 6000, {}),
        ("lead_7", "Kunal Mehta", "919822011007", "practo", "Implants", "lost", 15, True, 50000, {"lost": "price"}),
        ("lead_8", "Farah Shaikh", "919822011008", "justdial", "Checkup", "lost", 20, True, None, {"lost": "no_response"}),
        ("lead_9", "Arjun Rao", "919822011009", "walk_in", "Tooth pain", "won", 25, True, 4500, {}),
        ("lead_10", "Divya Nair", "919822011010", "instagram", "Braces / aligners", "contacted", 1, True, 70000, {}),
    ]
    for lid, name, phone, source, interest, status, days, contacted, value, extra in rows:
        created = now - timedelta(days=days)
        first = created + timedelta(minutes=12 + int(days * 7) % 50) if contacted else None
        follow = None
        if status == "new":
            follow = created + timedelta(minutes=15)
        elif status == "contacted":
            follow = now - timedelta(hours=5) if extra.get("overdue") else now + timedelta(days=1)
        lead = Lead(id=lid, clinic_id=DEFAULT_CLINIC, name=name, phone=phone, source=source, interest=interest,
                    message=extra.get("msg"), status=status, lost_reason=extra.get("lost"),
                    estimated_value=value, assigned_to_id="s2" if contacted else None, next_follow_up_at=follow,
                    first_contacted_at=first, last_contacted_at=first, contact_count=1 if contacted else 0,
                    whatsapp_consent=source in ("whatsapp", "website", "instagram"),
                    closed_at=created + timedelta(days=3) if status in ("won", "lost") else None,
                    campaign={"utm_source": source, "utm_campaign": "diwali-smile"} if source in ("instagram", "facebook") else None)
        lead.created_at = lead.updated_at = created
        db.add(lead)
        db.flush()
        db.add(LeadActivity(lead_id=lid, kind="created", body=extra.get("msg") or "", data={"source": source}, created_at=created))
        if first:
            db.add(LeadActivity(lead_id=lid, kind="call", body="Explained the treatment and fees", outcome="answered",
                                created_by_id="s2", created_at=first))
        if status in ("consult_booked", "won", "lost"):
            db.add(LeadActivity(lead_id=lid, kind="status", body=f"contacted → {status.replace('_', ' ')}",
                                created_by_id="s2", created_at=created + timedelta(days=1)))
    db.add(AppSetting(key="lead_settings", value={"whatsappClinicId": DEFAULT_CLINIC}))
    central = db.get(Clinic, DEFAULT_CLINIC)
    if central:
        central.lead_token = "demo-central-lead-key"


def seed_compliance(db: Session) -> None:
    """A week of sterilisation records at Central, and privacy settings with a sample request."""
    from datetime import date as date_

    from app.models import AppSetting, DataRequest, InstrumentPack, SterilisationCycle, Steriliser

    tz = ZoneInfo("Asia/Kolkata")
    now = datetime.now(timezone.utc)
    today = now.astimezone(tz).date()
    a = Steriliser(id="ster_1", clinic_id=DEFAULT_CLINIC, name="Autoclave A (Class B)", kind="autoclave_b",
                   serial_number="WH-B22-04417", last_serviced_on=today - timedelta(days=150), service_interval_days=180,
                   validated_on=today - timedelta(days=150))
    b = Steriliser(id="ster_2", clinic_id=DEFAULT_CLINIC, name="Autoclave B (Class N)", kind="autoclave_n",
                   serial_number="TN-17-88213", last_serviced_on=today - timedelta(days=200), service_interval_days=180)
    db.add_all([a, b])
    db.flush()
    kits = ["Examination kit", "Examination kit", "Scaling kit", "Restorative kit", "Extraction kit", "Endo kit"]
    alphabet = "ACDEFGHJKMNPQRTUVWXY3479"
    rng = random.Random(7)
    patients = ["pat_1", "pat_2", "pat_3", "pat_4", "pat_5", "pat_6", "pat_7"]

    def cycle(st, kind, day, hour, result="passed", **extra):
        st.cycle_counter += 1
        start = datetime.combine(day, time(hour, 0), tzinfo=tz).astimezone(timezone.utc)
        c = SterilisationCycle(id=f"cyc_{st.id[-1]}_{st.cycle_counter}", clinic_id=DEFAULT_CLINIC, steriliser_id=st.id,
                               cycle_number=st.cycle_counter, kind=kind, started_at=start,
                               ended_at=start + timedelta(minutes=50 if kind == "load" else 20), result=result,
                               operator_id="s2", released_by_id="s2" if result == "passed" else None,
                               program="134°C wrapped" if kind == "load" else None, **extra)
        db.add(c)
        db.flush()
        return c

    bi_done = False
    for back in range(6, -1, -1):
        day = today - timedelta(days=back)
        if day.weekday() == 6:
            continue
        cycle(a, "helix", day, 8, test_ok=True)
        if not bi_done:  # weekly spore test on the first working day
            bi_done = True
            cycle(a, "bi_test", day, 8, bi_status="passed", bi_lot="SPS-2611", bi_read_at=now - timedelta(days=5))
        if back == 0:
            break  # today: the morning test is done, loads start later
        for n, hour in enumerate((11, 16)):
            c = cycle(a if n == 0 else b, "load", day, hour, temperature_c=134, pressure_bar=2.1, hold_minutes=4, chemical_indicator_ok=True)
            for k in range(3):
                code = "".join(rng.choice(alphabet) for _ in range(6))
                used = back > 1 and k < 2
                db.add(InstrumentPack(clinic_id=DEFAULT_CLINIC, code=f"{code[:3]}-{code[3:]}", contents=kits[(n * 3 + k) % len(kits)],
                                      cycle_id=c.id, status="used" if used else "sterile",
                                      expires_on=day + timedelta(days=30 if back != 5 else 6),
                                      used_at=c.started_at + timedelta(days=1, hours=1) if used else None,
                                      patient_id=patients[(back + k) % len(patients)] if used else None,
                                      used_by_id="s1" if used else None))
    db.add(AppSetting(key="privacy_settings", value={
        "grievanceOfficerName": "Clinic Data Protection Desk", "grievanceOfficerEmail": "privacy@visionedge.example",
        "grievanceOfficerPhone": "+91 20 4000 1000"}))
    db.add(DataRequest(patient_id="pat_2", clinic_id=DEFAULT_CLINIC, kind="correction", source="portal",
                       details="My date of birth is wrong, it should be 12 March 1988.", requester_name="Bob Smith",
                       due_on=date_.today() + timedelta(days=26), created_by_id=None))
