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
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import AppSetting, Appointment, Clinic, Notification, Patient, StaffProfile, User, WaitlistEntry

SEED_FILE = Path(__file__).parent / "seed_data" / "demo_seed.json"
DEFAULT_CLINIC = "c1b48b94-132d-41a4-8f77-e2307fbadd2f"


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
    for p in data["patients"]:
        db.add(Patient(
            id=p["id"], clinic_id=first_clinic.get(p["id"], DEFAULT_CLINIC),
            first_name=p["firstName"], last_name=p.get("lastName", ""), phone=p["phone"], email=p.get("email"),
            dob=p.get("dob"), gender=p.get("gender"), address=p.get("address"),
            communication_prefs=p.get("communicationPrefs"), emergency_contact=p.get("emergencyContact"),
            medical_history=p.get("medicalHistory"), dental_history=p.get("dentalHistory"),
            insurance=p.get("insurance"), referral_source=p.get("referralSource"), tags=p.get("tags", []),
            last_visit=p.get("lastVisit"), outstanding_balance=p.get("outstandingBalance", 0),
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
    db.commit()
    return {"clinics": len(data["clinics"]), "users": len(users), "patients": len(data["patients"]),
            "appointments": len(data["appointments"])}


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
