from datetime import datetime, timedelta, timezone

from tests.conftest import PASSWORD, login

API = "/api/v1"
CENTRAL = "c1b48b94-132d-41a4-8f77-e2307fbadd2f"
WESTSIDE = "dbbd4709-3224-4f01-b541-ef17621436dd"


def future(hours: int, days: int = 7) -> str:
    base = (datetime.now(timezone.utc) + timedelta(days=days)).replace(hour=4, minute=0, second=0, microsecond=0)
    return (base + timedelta(hours=hours)).isoformat()


# ---------- Auth ----------

def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_login_returns_camelcase_user(client):
    body = login(client, "dr.smith@visionedge.com")
    assert body["tokenType"] == "bearer"
    assert body["user"]["firstName"] == "Sarah"
    assert body["user"]["role"] == "dentist"
    assert CENTRAL in body["user"]["clinicIds"]
    assert "passwordHash" not in body["user"]


def test_login_wrong_password_is_generic(client):
    res = client.post(f"{API}/auth/login", json={"email": "dr.smith@visionedge.com", "password": "nope"})
    assert res.status_code == 401
    assert res.json() == {"message": "Invalid email or password", "code": "INVALID_CREDENTIALS"}
    res = client.post(f"{API}/auth/login", json={"email": "ghost@example.com", "password": "nope"})
    assert res.json()["code"] == "INVALID_CREDENTIALS"


def test_requires_token(client):
    res = client.get(f"{API}/patients")
    assert res.status_code == 401
    assert res.json()["code"] == "UNAUTHORIZED"


def test_refresh_and_logout_invalidate_tokens(client):
    body = login(client, "john.reception@visionedge.com")
    headers = {"Authorization": f"Bearer {body['accessToken']}"}
    refreshed = client.post(f"{API}/auth/refresh", json={"refreshToken": body["refreshToken"]})
    assert refreshed.status_code == 200
    assert client.post(f"{API}/auth/logout", headers=headers).status_code == 204
    # Old access and refresh tokens no longer work after logout.
    assert client.get(f"{API}/auth/me", headers=headers).status_code == 401
    assert client.post(f"{API}/auth/refresh", json={"refreshToken": body["refreshToken"]}).status_code == 401


def test_access_token_cannot_be_used_as_refresh(client):
    body = login(client, "admin@visionedge.com")
    res = client.post(f"{API}/auth/refresh", json={"refreshToken": body["accessToken"]})
    assert res.status_code == 401


def test_change_password(client, as_role):
    h = as_role("dentist")
    res = client.post(f"{API}/auth/change-password", headers=h,
                      json={"currentPassword": PASSWORD, "newPassword": "BrandNew#2026"})
    assert res.status_code == 204
    ok = client.post(f"{API}/auth/login", json={"email": "dr.smith@visionedge.com", "password": "BrandNew#2026"})
    assert ok.status_code == 200


# ---------- Role-based access ----------

def test_patient_cannot_use_staff_endpoints(client, as_role):
    h = as_role("patient")
    assert client.get(f"{API}/patients", headers=h).status_code == 403
    assert client.get(f"{API}/appointments", headers=h).status_code == 403
    assert client.get(f"{API}/staff", headers=h).status_code == 403


def test_only_super_admin_creates_clinics(client, as_role):
    payload = {"name": "Pune Smiles", "email": "pune@visionedge.com"}
    assert client.post(f"{API}/clinics", json=payload, headers=as_role("receptionist")).status_code == 403
    res = client.post(f"{API}/clinics", json=payload, headers=as_role("super_admin"))
    assert res.status_code == 201
    assert res.json()["status"] == "active"
    dup = client.post(f"{API}/clinics", json=payload, headers=as_role("super_admin"))
    assert dup.status_code == 409


def test_clinic_scoping(client, as_role):
    # The Westside admin only sees Westside.
    clinics = client.get(f"{API}/clinics", headers=as_role("admin")).json()
    assert [c["id"] for c in clinics] == [WESTSIDE]
    assert client.get(f"{API}/clinics/{CENTRAL}", headers=as_role("admin")).status_code == 403
    # Super admin sees all, with live counts.
    all_clinics = client.get(f"{API}/clinics", headers=as_role("super_admin")).json()
    assert len(all_clinics) == 3
    central = next(c for c in all_clinics if c["id"] == CENTRAL)
    assert central["activeStaffCount"] >= 2 and central["activePatientsCount"] > 0


def test_receptionist_cannot_see_other_clinic_patients(client, as_role):
    # pat_1 belongs to Central; the Westside admin must not be able to read it.
    assert client.get(f"{API}/patients/pat_1", headers=as_role("admin")).status_code == 404
    assert client.get(f"{API}/patients/pat_1", headers=as_role("receptionist")).status_code == 200


# ---------- Staff ----------

def test_staff_create_update_deactivate(client, as_role):
    h = as_role("super_admin")
    res = client.post(f"{API}/staff", headers=h, json={
        "email": "new.dentist@visionedge.com", "firstName": "Meera", "lastName": "Patil", "role": "dentist",
        "clinicIds": [CENTRAL], "specializations": ["Endodontics"],
        "workingHours": [{"day": "Monday", "isWorking": True, "startTime": "09:00", "endTime": "17:00"}],
    })
    assert res.status_code == 201, res.text
    created = res.json()
    assert created["temporaryPassword"]
    assert created["workingHours"][0]["isWorking"] is True

    upd = client.patch(f"{API}/staff/{created['id']}", headers=h, json={"specializations": ["Endo", "General"]})
    assert upd.json()["specializations"] == ["Endo", "General"]

    # New dentist can log in with the temporary password, until deactivated.
    ok = client.post(f"{API}/auth/login", json={"email": "new.dentist@visionedge.com",
                                                 "password": created["temporaryPassword"]})
    assert ok.status_code == 200
    assert client.delete(f"{API}/staff/{created['id']}", headers=h).json()["status"] == "inactive"
    blocked = client.post(f"{API}/auth/login", json={"email": "new.dentist@visionedge.com",
                                                      "password": created["temporaryPassword"]})
    assert blocked.status_code == 401


def test_clinic_admin_cannot_create_admin_or_other_clinic_staff(client, as_role):
    h = as_role("admin")
    res = client.post(f"{API}/staff", headers=h, json={"email": "x@visionedge.com", "firstName": "X",
                                                       "role": "admin", "clinicIds": [WESTSIDE]})
    assert res.status_code == 403
    res = client.post(f"{API}/staff", headers=h, json={"email": "y@visionedge.com", "firstName": "Y",
                                                       "role": "receptionist", "clinicIds": [CENTRAL]})
    assert res.status_code == 403


def test_duplicate_staff_email(client, as_role):
    res = client.post(f"{API}/staff", headers=as_role("super_admin"), json={
        "email": "DR.SMITH@visionedge.com", "firstName": "Dup", "role": "dentist", "clinicIds": [CENTRAL]})
    assert res.status_code == 409


# ---------- Patients ----------

def test_patient_list_search_and_duplicates(client, as_role):
    h = as_role("receptionist")
    patients = client.get(f"{API}/patients", headers=h)
    assert patients.status_code == 200
    assert int(patients.headers["X-Total-Count"]) == len(patients.json())
    found = client.get(f"{API}/patients", headers=h, params={"search": "alice"}).json()
    alice = next(p for p in found if p["id"] == "pat_1")
    assert alice["medicalHistory"]["allergies"] == ["Penicillin", "Latex"]
    assert alice["communicationPrefs"]["whatsappOptIn"] is True

    dup = client.get(f"{API}/patients/check-duplicate", headers=h, params={"phone": "9876511111"}).json()
    assert dup["isDuplicate"] is True and dup["matches"][0]["id"] == "pat_1"


def test_create_patient_rejects_duplicate_phone_unless_allowed(client, as_role):
    h = as_role("receptionist")
    body = {"firstName": "Rahul", "lastName": "Desai", "phone": "+91 98765 11111", "dob": "1990-01-01",
            "communicationPrefs": {"whatsappOptIn": True, "language": "Marathi"}}
    res = client.post(f"{API}/patients", headers=h, json=body)
    assert res.status_code == 409 and res.json()["code"] == "DUPLICATE_PATIENT"
    res = client.post(f"{API}/patients", headers=h, json=body, params={"allowDuplicate": True})
    assert res.status_code == 201
    created = res.json()
    assert created["clinicId"] == CENTRAL
    assert created["communicationPrefs"]["language"] == "Marathi"


def test_patient_validation_errors_have_field_messages(client, as_role):
    res = client.post(f"{API}/patients", headers=as_role("receptionist"),
                      json={"firstName": "", "phone": "1", "dob": "12/05/1990"})
    assert res.status_code == 422
    errors = res.json()["fieldErrors"]
    assert "firstName" in errors and "phone" in errors and "dob" in errors


def test_update_patient_and_audit_log(client, as_role):
    h = as_role("receptionist")
    res = client.patch(f"{API}/patients/pat_2", headers=h, json={"tags": ["VIP"], "email": "bob.new@example.com"})
    assert res.status_code == 200 and res.json()["tags"] == ["VIP"]
    logs = client.get(f"{API}/audit-logs", headers=as_role("super_admin"), params={"entity_type": "patient"}).json()
    assert logs[0]["entityId"] == "pat_2" and logs[0]["action"] == "update"


# ---------- Appointments ----------

def test_book_appointment_and_conflict_detection(client, as_role):
    h = as_role("receptionist")
    body = {"patientId": "pat_3", "dentistId": "s1", "clinicId": CENTRAL, "startTime": future(0),
            "endTime": future(1), "procedureType": "Checkup"}
    first = client.post(f"{API}/appointments", headers=h, json=body)
    assert first.status_code == 201, first.text
    assert first.json()["status"] == "scheduled"

    clash = client.post(f"{API}/appointments", headers=h, json={**body, "patientId": "pat_4"})
    assert clash.status_code == 409 and clash.json()["code"] == "APPOINTMENT_CONFLICT"

    forced = client.post(f"{API}/appointments", headers=h, json={**body, "patientId": "pat_4", "allowOverlap": True})
    assert forced.status_code == 201

    # Back-to-back is fine.
    later = client.post(f"{API}/appointments", headers=h,
                        json={**body, "patientId": "pat_5", "startTime": future(1), "endTime": future(2)})
    assert later.status_code == 201


def test_appointment_rules(client, as_role):
    h = as_role("receptionist")
    base = {"patientId": "pat_3", "clinicId": CENTRAL, "startTime": future(3), "endTime": future(4),
            "procedureType": "Checkup"}
    # End before start
    bad = client.post(f"{API}/appointments", headers=h, json={**base, "dentistId": "s1", "endTime": future(2)})
    assert bad.status_code == 422
    # Receptionist is not a dentist
    assert client.post(f"{API}/appointments", headers=h, json={**base, "dentistId": "s2"}).status_code == 404
    # Inactive clinic
    res = client.post(f"{API}/appointments", headers=as_role("super_admin"),
                      json={**base, "dentistId": "s1", "clinicId": "c3"})
    assert res.json()["code"] in ("CLINIC_INACTIVE", "DENTIST_NOT_AT_CLINIC")


def test_reschedule_cancel_checkin(client, as_role):
    h = as_role("receptionist")
    appt = client.post(f"{API}/appointments", headers=h, json={
        "patientId": "pat_3", "dentistId": "s1", "clinicId": CENTRAL, "startTime": future(5), "endTime": future(6),
        "procedureType": "Cleaning"}).json()
    moved = client.patch(f"{API}/appointments/{appt['id']}", headers=h,
                         json={"startTime": future(6), "endTime": future(7)})
    assert moved.status_code == 200
    assert client.post(f"{API}/appointments/{appt['id']}/check-in", headers=h).json()["status"] == "in_progress"
    cancelled = client.delete(f"{API}/appointments/{appt['id']}", headers=h, params={"reason": "Patient unwell"})
    assert cancelled.json()["status"] == "cancelled"
    assert "Patient unwell" in cancelled.json()["notes"]


def test_list_appointments_filters(client, as_role):
    h = as_role("super_admin")
    all_appts = client.get(f"{API}/appointments", headers=h).json()
    assert len([a for a in all_appts if a["id"].startswith("appt_")]) == 6  # plus past visits (hist_*)
    westside = client.get(f"{API}/appointments", headers=h, params={"clinicId": WESTSIDE}).json()
    assert {a["clinicId"] for a in westside} == {WESTSIDE}
    smith = client.get(f"{API}/appointments", headers=h, params={"dentistId": "s1"}).json()
    assert {a["dentistId"] for a in smith} == {"s1"}


# ---------- Dashboards, notifications, settings ----------

def test_dashboards_have_expected_shape(client, as_role):
    sa = client.get(f"{API}/dashboard/super_admin", headers=as_role("super_admin")).json()
    assert {"totalClinics", "activePatients", "todayAppointments", "revenueTrend", "topClinics",
            "recentActivity"} <= sa.keys()
    assert sa["totalClinics"] == 2 and sa["activePatients"] == 15

    d = client.get(f"{API}/dashboard/dentist", headers=as_role("dentist")).json()
    assert {"patientsSeenThisWeek", "todaySchedule", "nextPatient", "lowInventoryItems"} <= d.keys()

    r = client.get(f"{API}/dashboard/receptionist", headers=as_role("receptionist")).json()
    assert {"pendingPayments", "queue", "lowInventoryItems"} <= r.keys()

    p = client.get(f"{API}/dashboard/patient", headers=as_role("patient")).json()
    assert {"nextAppointment", "recentTreatment", "outstandingBalance"} <= p.keys()

    assert client.get(f"{API}/dashboard/super_admin", headers=as_role("dentist")).status_code == 403


def test_notifications_are_per_user(client, as_role):
    h = as_role("dentist")
    notes = client.get(f"{API}/notifications", headers=h).json()
    unread = next(n for n in notes if not n["isRead"])
    assert client.patch(f"{API}/notifications/{unread['id']}/read", headers=h).json()["isRead"] is True
    # Another user cannot touch it.
    assert client.patch(f"{API}/notifications/{unread['id']}/read", headers=as_role("receptionist")).status_code == 404


def test_permissions_and_subscription(client, as_role):
    perms = client.get(f"{API}/permissions", headers=as_role("receptionist")).json()
    assert perms[0]["roles"]["super_admin"]["view"] is True
    assert client.get(f"{API}/platform/subscription", headers=as_role("super_admin")).status_code == 200
    assert client.get(f"{API}/platform/subscription", headers=as_role("receptionist")).status_code == 403


def test_waitlist(client, as_role):
    h = as_role("receptionist")
    assert len(client.get(f"{API}/waitlist", headers=h).json()) == 1
    res = client.post(f"{API}/waitlist", headers=h, json={"patientId": "pat_5", "clinicId": CENTRAL,
                                                         "preferredDateRange": "Weekends"})
    assert res.status_code == 201 and res.json()["status"] == "waiting"


# ---------- Patient portal ----------

def test_patient_portal_flow(client, as_role):
    h = as_role("patient")
    options = client.get(f"{API}/patient-portal/booking-options", headers=h).json()
    central = next(c for c in options if c["id"] == CENTRAL)
    assert any(d["id"] == "s1" for d in central["dentists"])

    slots = client.get(f"{API}/availability/next", headers=h,
                       params={"clinicId": CENTRAL, "dentistId": "s1", "duration": 30}).json()
    assert len(slots) >= 2
    booked = client.post(f"{API}/patient-portal/appointments/book", headers=h, json={
        "dentistId": "s1", "clinicId": CENTRAL, "startTime": slots[0]["startTime"], "endTime": slots[0]["endTime"],
        "procedureType": "Consultation"})
    assert booked.status_code == 201, booked.text
    appt_id = booked.json()["id"]
    assert booked.json()["patientId"] == "pat_1"

    mine = client.get(f"{API}/patient-portal/appointments", headers=h).json()
    assert any(a["id"] == appt_id for a in mine)
    assert all(a["patientId"] == "pat_1" for a in mine)

    resched = client.post(f"{API}/patient-portal/appointments/{appt_id}/reschedule", headers=h,
                          json={"startTime": slots[-1]["startTime"], "endTime": slots[-1]["endTime"]})
    assert resched.status_code == 200
    cancel = client.post(f"{API}/patient-portal/appointments/{appt_id}/cancel", headers=h, json={"reason": "Travel"})
    assert cancel.json()["status"] == "cancelled"

    records = client.get(f"{API}/patient-portal/records", headers=h).json()
    assert records["profile"]["id"] == "pat_1"


def test_patient_cannot_touch_other_patients_appointments(client, as_role):
    # appt_2 belongs to pat_2.
    res = client.post(f"{API}/patient-portal/appointments/appt_2/cancel", headers=as_role("patient"), json={})
    assert res.status_code == 404


def test_patient_cannot_book_last_minute(client, as_role):
    soon = datetime.now(timezone.utc) + timedelta(minutes=30)
    res = client.post(f"{API}/patient-portal/appointments/book", headers=as_role("patient"), json={
        "dentistId": "s1", "clinicId": CENTRAL, "startTime": soon.isoformat(),
        "endTime": (soon + timedelta(minutes=30)).isoformat(), "procedureType": "Consultation"})
    assert res.json()["code"] == "TOO_LATE"


def test_patient_edit_request(client, as_role):
    res = client.patch(f"{API}/patients/pat_1/request-edit", headers=as_role("patient"),
                       json={"phone": "+91 90000 00000"})
    assert res.status_code == 200
    assert res.json()["editRequest"]["changes"] == {"phone": "+91 90000 00000"}
    # Not allowed for someone else's record.
    assert client.patch(f"{API}/patients/pat_2/request-edit", headers=as_role("patient"),
                        json={"phone": "1234567"}).status_code == 404
