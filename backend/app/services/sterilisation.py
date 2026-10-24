"""Steriliser cycles and instrument packs, traced from the cycle to the patient.

A load cycle creates labelled packs. They are held ("awaiting release") until the cycle is recorded as
passed (and, if the clinic chooses, until the spore test is read). Only released, in-date packs can be
used on a patient. If a cycle or its spore test fails, unused packs are recalled for reprocessing and the
patients who already had packs from it are listed, so the clinic can follow its exposure protocol.
"""

from __future__ import annotations

import secrets
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AppSetting, Appointment, Clinic, InstrumentPack, Notification, Patient, SterilisationCycle, Steriliser, User
from app.services.availability import clinic_tz
from app.services.scheduling import as_utc

TEST_KINDS = ("bowie_dick", "helix", "vacuum_test")
CYCLE_KINDS = ("load",) + TEST_KINDS + ("bi_test",)
CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY3479"  # no 0/O, 1/I/L, 2/Z, 5/S, 8/B look-alikes

DEFAULT_SETTINGS: dict[str, Any] = {
    "shelfLifeDays": 30,  # pouched instruments; event-related shelf life is also common, set per your protocol
    "requireDailyTest": False,  # block loads until today's Bowie-Dick/helix test has passed (vacuum autoclaves)
    "holdForSporeTest": False,  # keep packs from cycles with a spore test pending until it's read
    "sporeTestEveryDays": 7,
    "minTemperatureC": 121,
    "minHoldMinutes": 3,
}


def settings(db: Session) -> dict[str, Any]:
    row = db.get(AppSetting, "sterilisation_settings")
    return {**DEFAULT_SETTINGS, **((row.value if row else None) or {})}


def save_settings(db: Session, changes: dict[str, Any]) -> dict[str, Any]:
    current = settings(db)
    current.update({k: v for k, v in changes.items() if k in DEFAULT_SETTINGS and v is not None})
    row = db.get(AppSetting, "sterilisation_settings")
    if row:
        row.value = current
    else:
        db.add(AppSetting(key="sterilisation_settings", value=current))
    return current


class SterilisationError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def _today(db: Session, clinic_id: str) -> date:
    clinic = db.get(Clinic, clinic_id)
    return datetime.now(timezone.utc).astimezone(clinic_tz(clinic)).date() if clinic else date.today()


def _day_bounds(db: Session, clinic_id: str, day: date) -> tuple[datetime, datetime]:
    clinic = db.get(Clinic, clinic_id)
    tz = clinic_tz(clinic) if clinic else timezone.utc
    start = datetime.combine(day, time.min, tzinfo=tz).astimezone(timezone.utc)
    return start, start + timedelta(days=1)


def daily_test_passed(db: Session, steriliser: Steriliser, day: date | None = None) -> bool:
    day = day or _today(db, steriliser.clinic_id)
    a, b = _day_bounds(db, steriliser.clinic_id, day)
    return db.scalars(select(SterilisationCycle.id).where(
        SterilisationCycle.steriliser_id == steriliser.id, SterilisationCycle.kind.in_(TEST_KINDS),
        SterilisationCycle.result == "passed", SterilisationCycle.started_at >= a, SterilisationCycle.started_at < b)).first() is not None


def needs_daily_test(steriliser: Steriliser) -> bool:
    return steriliser.kind in ("autoclave_b", "autoclave_s")


def service_due_on(steriliser: Steriliser) -> date | None:
    if not steriliser.last_serviced_on:
        return None
    return steriliser.last_serviced_on + timedelta(days=steriliser.service_interval_days)


def _new_code(db: Session) -> str:
    for _ in range(20):
        raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        code = f"{raw[:3]}-{raw[3:]}"
        if not db.scalars(select(InstrumentPack.id).where(InstrumentPack.code == code)).first():
            return code
    raise RuntimeError("Could not make a unique pack code")


def normalise_code(code: str) -> str:
    raw = "".join(ch for ch in (code or "").upper() if ch.isalnum())
    return f"{raw[:3]}-{raw[3:]}" if len(raw) == 6 else (code or "").strip().upper()


def start_cycle(db: Session, steriliser: Steriliser, kind: str, operator: User, program: str | None = None,
                packs: list[dict] | None = None, notes: str | None = None) -> tuple[SterilisationCycle, list[str]]:
    """Start a cycle. Returns the cycle and any warnings (e.g. no daily test yet)."""
    if not steriliser.is_active:
        raise SterilisationError("STERILISER_OUT_OF_SERVICE",
                                 f"{steriliser.name} is out of service" + (f": {steriliser.out_of_service_reason}" if steriliser.out_of_service_reason else ""), 409)
    cfg = settings(db)
    warnings: list[str] = []
    if kind == "load":
        if not packs or sum(int(p.get("count", 0)) for p in packs) < 1:
            raise SterilisationError("NO_PACKS", "Add the packs in this load")
        if needs_daily_test(steriliser) and not daily_test_passed(db, steriliser):
            if cfg["requireDailyTest"]:
                raise SterilisationError("DAILY_TEST_REQUIRED", "Run and pass today's Bowie-Dick/helix test first", 409)
            warnings.append("No passed Bowie-Dick/helix test today")
        due = service_due_on(steriliser)
        if due and due < _today(db, steriliser.clinic_id):
            warnings.append(f"Service was due on {due:%d %b %Y}")
    elif packs:
        raise SterilisationError("TEST_HAS_NO_PACKS", "Test cycles don't carry instrument packs")

    steriliser.cycle_counter += 1
    cycle = SterilisationCycle(clinic_id=steriliser.clinic_id, steriliser_id=steriliser.id, cycle_number=steriliser.cycle_counter,
                               kind=kind, program=program, operator_id=operator.id, notes=notes,
                               bi_status="pending" if kind == "bi_test" else "none")
    db.add(cycle)
    db.flush()
    expires = _today(db, steriliser.clinic_id) + timedelta(days=int(cfg["shelfLifeDays"]))
    for p in packs or []:
        for _ in range(min(int(p.get("count", 1)), 100)):
            db.add(InstrumentPack(clinic_id=steriliser.clinic_id, code=_new_code(db), contents=str(p["contents"])[:120],
                                  cycle_id=cycle.id, expires_on=expires))
            db.flush()
    return cycle, warnings


def packs_of(db: Session, cycle: SterilisationCycle) -> list[InstrumentPack]:
    return list(db.scalars(select(InstrumentPack).where(InstrumentPack.cycle_id == cycle.id).order_by(InstrumentPack.created_at)))


def _notify_admins(db: Session, clinic_id: str, title: str, message: str) -> None:
    for u in db.scalars(select(User).where(User.role.in_(("admin", "super_admin")), User.is_active.is_(True))).unique():
        clinics = {u.clinic_id} | set((u.staff_profile.clinic_ids if u.staff_profile else None) or [])
        if u.role == "super_admin" or clinic_id in clinics:
            db.add(Notification(user_id=u.id, title=title, message=message))


def record_result(db: Session, cycle: SterilisationCycle, actor: User, *, passed: bool,
                  temperature_c=None, pressure_bar=None, hold_minutes=None, chemical_indicator_ok: bool | None = None,
                  failure_reason: str | None = None, bi_lot: str | None = None, notes: str | None = None) -> list[str]:
    """Record the end of a cycle. Returns warnings. Physical readings below the minimum fail the cycle."""
    if cycle.result != "running":
        raise SterilisationError("CYCLE_CLOSED", "This cycle already has a result", 409)
    cfg = settings(db)
    warnings: list[str] = []
    cycle.ended_at = datetime.now(timezone.utc)
    cycle.temperature_c, cycle.pressure_bar, cycle.hold_minutes = temperature_c, pressure_bar, hold_minutes
    cycle.notes = notes or cycle.notes
    reasons = []
    if failure_reason:
        reasons.append(failure_reason)
    if cycle.kind == "load":
        if chemical_indicator_ok is None and passed:
            raise SterilisationError("INDICATOR_REQUIRED", "Check the chemical indicator before releasing the load")
        cycle.chemical_indicator_ok = chemical_indicator_ok
        if chemical_indicator_ok is False:
            reasons.append("Chemical indicator did not change")
        if temperature_c is not None and float(temperature_c) < float(cfg["minTemperatureC"]):
            reasons.append(f"Temperature {temperature_c}°C below {cfg['minTemperatureC']}°C")
        if hold_minutes is not None and float(hold_minutes) < float(cfg["minHoldMinutes"]):
            reasons.append(f"Hold time {hold_minutes} min below {cfg['minHoldMinutes']} min")
        if bi_lot:
            cycle.bi_lot, cycle.bi_status = bi_lot, "pending"
    elif cycle.kind in TEST_KINDS:
        cycle.test_ok = passed
    if cycle.kind == "bi_test":
        cycle.bi_lot = bi_lot or cycle.bi_lot
    ok = passed and not reasons
    cycle.failure_reason = "; ".join(reasons) or (None if ok else "Marked as failed")
    if cycle.kind == "bi_test":
        cycle.result = "passed" if ok else "failed"  # the run itself; the spore result comes later
    else:
        cycle.result = "passed" if ok else "failed"
    cycle.released_by_id = actor.id if ok else None

    packs = packs_of(db, cycle)
    if ok:
        hold = cfg["holdForSporeTest"] and cycle.bi_status == "pending"
        for p in packs:
            if p.status == "awaiting_release" and not hold:
                p.status = "sterile"
        if hold and packs:
            warnings.append("Packs are held until the spore test is read")
    else:
        for p in packs:
            if p.status in ("awaiting_release", "sterile"):
                p.status, p.status_note = "recalled", "Cycle failed: reprocess"
        if cycle.kind in TEST_KINDS:
            st = db.get(Steriliser, cycle.steriliser_id)
            warnings.append(f"Don't run wrapped loads in {st.name if st else 'this steriliser'} until a test passes")
            _notify_admins(db, cycle.clinic_id, "Steriliser test failed",
                           f"{st.name if st else 'Steriliser'} failed the {cycle.kind.replace('_', '-')} test (cycle {cycle.cycle_number}).")
    return warnings


def record_spore_result(db: Session, cycle: SterilisationCycle, actor: User, passed: bool, note: str | None = None) -> dict[str, Any]:
    """Read the biological indicator. A failure recalls packs and takes the steriliser out of service."""
    if cycle.bi_status != "pending":
        raise SterilisationError("NO_SPORE_TEST", "No spore test is waiting on this cycle", 409)
    cycle.bi_status = "passed" if passed else "failed"
    cycle.bi_read_at = datetime.now(timezone.utc)
    if note:
        cycle.notes = f"{cycle.notes}\n{note}" if cycle.notes else note
    st = db.get(Steriliser, cycle.steriliser_id)
    if passed:
        if cycle.result == "passed":
            for p in packs_of(db, cycle):
                if p.status == "awaiting_release":
                    p.status = "sterile"
        return {"recalled": 0, "exposed": []}

    # Failed: this cycle, and every load since the last passed spore test on this steriliser, is suspect.
    last_good = db.scalars(select(SterilisationCycle).where(
        SterilisationCycle.steriliser_id == cycle.steriliser_id, SterilisationCycle.bi_status == "passed",
        SterilisationCycle.started_at < cycle.started_at).order_by(SterilisationCycle.started_at.desc())).first()
    since = last_good.started_at if last_good else cycle.started_at
    suspect = list(db.scalars(select(SterilisationCycle).where(
        SterilisationCycle.steriliser_id == cycle.steriliser_id, SterilisationCycle.kind == "load",
        SterilisationCycle.started_at >= since)))
    if cycle.kind == "load" and cycle not in suspect:
        suspect.append(cycle)
    recalled = 0
    exposed: list[dict[str, Any]] = []
    for c in suspect:
        if c.id == cycle.id:
            c.result = "failed"
            c.failure_reason = "Spore test failed"
        for p in packs_of(db, c):
            if p.status in ("awaiting_release", "sterile"):
                p.status, p.status_note = "recalled", "Spore test failed: reprocess"
                recalled += 1
        exposed += exposure(db, c)
    if st:
        st.is_active = False
        st.out_of_service_reason = f"Spore test failed on cycle {cycle.cycle_number}. Service and retest before use."
    _notify_admins(db, cycle.clinic_id, "Spore test failed",
                   f"{st.name if st else 'Steriliser'}: {recalled} packs recalled, {len(exposed)} patients had packs from suspect cycles. "
                   "The steriliser is out of service until it is serviced and retested.")
    return {"recalled": recalled, "exposed": exposed}


def exposure(db: Session, cycle: SterilisationCycle) -> list[dict[str, Any]]:
    out = []
    for p in packs_of(db, cycle):
        if p.status != "used" or not p.patient_id:
            continue
        patient = db.get(Patient, p.patient_id)
        out.append({"packCode": p.code, "contents": p.contents, "usedAt": p.used_at, "patientId": p.patient_id,
                    "patientName": f"{patient.first_name} {patient.last_name}".strip() if patient else None,
                    "phone": patient.phone if patient else None, "appointmentId": p.appointment_id})
    return out


def use_pack(db: Session, pack: InstrumentPack, actor: User, appointment: Appointment | None, patient: Patient) -> InstrumentPack:
    today = _today(db, pack.clinic_id)
    if pack.status == "used":
        raise SterilisationError("PACK_USED", "This pack has already been used. Reprocess it before use.", 409)
    if pack.status == "recalled":
        raise SterilisationError("PACK_RECALLED", "Do not use: this pack was recalled. Reprocess it.", 409)
    if pack.status == "awaiting_release":
        raise SterilisationError("PACK_NOT_RELEASED", "Do not use yet: the cycle hasn't been released", 409)
    if pack.status in ("expired", "discarded") or pack.expires_on < today:
        if pack.status == "sterile":
            pack.status = "expired"
        raise SterilisationError("PACK_EXPIRED", f"Do not use: expired on {pack.expires_on:%d %b %Y}. Reprocess it.", 409)
    cycle = db.get(SterilisationCycle, pack.cycle_id)
    if not cycle or cycle.result != "passed":
        raise SterilisationError("PACK_NOT_RELEASED", "Do not use: the cycle did not pass", 409)
    pack.status, pack.used_at, pack.used_by_id = "used", datetime.now(timezone.utc), actor.id
    pack.patient_id, pack.appointment_id = patient.id, appointment.id if appointment else None
    return pack


def expire_packs(db: Session) -> int:
    n = 0
    for p in db.scalars(select(InstrumentPack).where(InstrumentPack.status == "sterile")):
        if p.expires_on < _today(db, p.clinic_id):
            p.status = "expired"
            n += 1
    return n


def overview(db: Session, clinic_ids: set[str] | None) -> dict[str, Any]:
    q = select(Steriliser).where(Steriliser.id.is_not(None))
    if clinic_ids is not None:
        q = q.where(Steriliser.clinic_id.in_(clinic_ids))
    machines = []
    cfg = settings(db)
    for st in db.scalars(q.order_by(Steriliser.name)):
        today = _today(db, st.clinic_id)
        last = db.scalars(select(SterilisationCycle).where(SterilisationCycle.steriliser_id == st.id)
                          .order_by(SterilisationCycle.started_at.desc())).first()
        last_bi = db.scalars(select(SterilisationCycle).where(SterilisationCycle.steriliser_id == st.id,
                                                              SterilisationCycle.bi_status.in_(("passed", "failed")))
                             .order_by(SterilisationCycle.started_at.desc())).first()
        due = service_due_on(st)
        machines.append({
            "id": st.id, "name": st.name, "kind": st.kind, "clinicId": st.clinic_id, "isActive": st.is_active,
            "outOfServiceReason": st.out_of_service_reason, "serialNumber": st.serial_number,
            "lastServicedOn": st.last_serviced_on, "serviceDueOn": due, "serviceOverdue": bool(due and due < today),
            "serviceIntervalDays": st.service_interval_days, "validatedOn": st.validated_on,
            "needsDailyTest": needs_daily_test(st), "dailyTestPassed": daily_test_passed(db, st, today),
            "lastCycleAt": last.started_at if last else None, "lastCycleResult": last.result if last else None,
            "cycleCount": st.cycle_counter,
            "lastSporeTestAt": last_bi.started_at if last_bi else None, "lastSporeResult": last_bi.bi_status if last_bi else None,
            "sporeTestDue": not last_bi or (datetime.now(timezone.utc) - as_utc(last_bi.started_at)).days >= int(cfg["sporeTestEveryDays"]),
        })
    pq = select(InstrumentPack)
    if clinic_ids is not None:
        pq = pq.where(InstrumentPack.clinic_id.in_(clinic_ids))
    packs = list(db.scalars(pq.where(InstrumentPack.status.in_(("sterile", "awaiting_release", "recalled")))))
    soon = date.today() + timedelta(days=7)
    running = select(SterilisationCycle).where(SterilisationCycle.result == "running")
    if clinic_ids is not None:
        running = running.where(SterilisationCycle.clinic_id.in_(clinic_ids))
    pending_bi = select(SterilisationCycle).where(SterilisationCycle.bi_status == "pending")
    if clinic_ids is not None:
        pending_bi = pending_bi.where(SterilisationCycle.clinic_id.in_(clinic_ids))
    return {
        "sterilisers": machines,
        "packs": {
            "sterile": sum(1 for p in packs if p.status == "sterile"),
            "expiringSoon": sum(1 for p in packs if p.status == "sterile" and p.expires_on <= soon),
            "awaitingRelease": sum(1 for p in packs if p.status == "awaiting_release"),
            "recalled": sum(1 for p in packs if p.status == "recalled"),
        },
        "runningCycles": len(list(db.scalars(running))),
        "pendingSporeTests": len(list(db.scalars(pending_bi))),
    }
