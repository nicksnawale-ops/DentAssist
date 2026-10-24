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
        inv = Invoice(invoice_number=billing.next_invoice_number(db, created), patient_id=patient_id,
                      clinic_id=clinic_id, due_date=created + timedelta(days=due_days), created_by_id=actor.id,
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
