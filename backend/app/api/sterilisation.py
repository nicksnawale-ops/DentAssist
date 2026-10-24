"""Sterilisers, cycles, instrument packs and the sterilisation register."""

import csv
import io
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import Field
from sqlalchemy import select

from app.core.deps import DbSession, StaffUser, accessible_clinic_ids, ensure_clinic_access, require_roles
from app.core.errors import AppError, bad_request, not_found
from app.models import Appointment, Clinic, InstrumentPack, Patient, SterilisationCycle, Steriliser, User
from app.schemas import CamelModel
from app.services import audit
from app.services import sterilisation as svc
from app.services.availability import clinic_tz
from app.services.scheduling import as_utc

router = APIRouter(tags=["sterilisation"])
Admins = Depends(require_roles("super_admin", "admin"))
KIND_RE = "^(autoclave_b|autoclave_n|autoclave_s|dry_heat|other)$"


class SteriliserIn(CamelModel):
    clinic_id: str | None = None
    name: str = Field(min_length=1, max_length=100)
    kind: str = Field(default="autoclave_b", pattern=KIND_RE)
    serial_number: str | None = Field(default=None, max_length=100)
    last_serviced_on: date | None = None
    service_interval_days: int = Field(default=180, ge=7, le=730)
    validated_on: date | None = None


class SteriliserUpdate(CamelModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    kind: str | None = Field(default=None, pattern=KIND_RE)
    serial_number: str | None = Field(default=None, max_length=100)
    last_serviced_on: date | None = None
    service_interval_days: int | None = Field(default=None, ge=7, le=730)
    validated_on: date | None = None
    is_active: bool | None = None
    note: str | None = Field(default=None, max_length=300)


class PackLine(CamelModel):
    contents: str = Field(min_length=1, max_length=120)
    count: int = Field(default=1, ge=1, le=100)


class CycleStart(CamelModel):
    steriliser_id: str
    kind: str = Field(default="load", pattern="^(load|bowie_dick|helix|vacuum_test|bi_test)$")
    program: str | None = Field(default=None, max_length=40)
    packs: list[PackLine] = Field(default_factory=list, max_length=30)
    notes: str | None = Field(default=None, max_length=1000)
    bi_lot: str | None = Field(default=None, max_length=60)


class CycleResult(CamelModel):
    passed: bool
    temperature_c: Decimal | None = Field(default=None, ge=0, le=250)
    pressure_bar: Decimal | None = Field(default=None, ge=0, le=10)
    hold_minutes: Decimal | None = Field(default=None, ge=0, le=300)
    chemical_indicator_ok: bool | None = None
    failure_reason: str | None = Field(default=None, max_length=300)
    bi_lot: str | None = Field(default=None, max_length=60)
    notes: str | None = Field(default=None, max_length=1000)


class SporeResult(CamelModel):
    passed: bool
    note: str | None = Field(default=None, max_length=500)


class UsePack(CamelModel):
    code: str = Field(min_length=4, max_length=40)
    appointment_id: str | None = None
    patient_id: str | None = None


class PackStatusIn(CamelModel):
    status: str = Field(pattern="^(discarded|expired)$")
    note: str | None = Field(default=None, max_length=300)


class SterilisationSettings(CamelModel):
    shelf_life_days: int | None = Field(default=None, ge=1, le=365)
    require_daily_test: bool | None = None
    hold_for_spore_test: bool | None = None
    spore_test_every_days: int | None = Field(default=None, ge=1, le=90)
    min_temperature_c: float | None = Field(default=None, ge=100, le=200)
    min_hold_minutes: float | None = Field(default=None, ge=1, le=120)


def _err(e: svc.SterilisationError) -> AppError:
    return AppError(e.status, e.message, e.code)


def _scope(user: User, clinic_id: str | None) -> set[str] | None:
    if clinic_id:
        ensure_clinic_access(user, clinic_id)
        return {clinic_id}
    return accessible_clinic_ids(user)


def _steriliser(db, user: User, sid: str) -> Steriliser:
    st = db.get(Steriliser, sid)
    if not st:
        raise not_found("Steriliser")
    ensure_clinic_access(user, st.clinic_id)
    return st


def _cycle(db, user: User, cid: str) -> SterilisationCycle:
    c = db.get(SterilisationCycle, cid)
    if not c:
        raise not_found("Cycle")
    ensure_clinic_access(user, c.clinic_id)
    return c


def _names(db, ids) -> dict[str, str]:
    ids = {i for i in ids if i}
    return {u.id: f"{u.first_name} {u.last_name}".strip() for u in db.scalars(select(User).where(User.id.in_(ids))).unique()} if ids else {}


def _pack_out(p: InstrumentPack, cycle: SterilisationCycle | None = None, steriliser: Steriliser | None = None,
              patient: Patient | None = None, today: date | None = None) -> dict:
    today = today or date.today()
    return {
        "id": p.id, "code": p.code, "contents": p.contents, "status": p.status, "statusNote": p.status_note,
        "expiresOn": p.expires_on, "isExpired": p.expires_on < today, "cycleId": p.cycle_id, "clinicId": p.clinic_id,
        "cycleNumber": cycle.cycle_number if cycle else None, "cycleResult": cycle.result if cycle else None,
        "sterilisedAt": cycle.started_at if cycle else None, "steriliserName": steriliser.name if steriliser else None,
        "usedAt": p.used_at, "patientId": p.patient_id,
        "patientName": f"{patient.first_name} {patient.last_name}".strip() if patient else None,
        "appointmentId": p.appointment_id, "createdAt": p.created_at,
    }


def _cycle_out(db, c: SterilisationCycle, names: dict[str, str] | None = None, with_packs: bool = False) -> dict:
    st = db.get(Steriliser, c.steriliser_id)
    packs = svc.packs_of(db, c)
    names = names if names is not None else _names(db, {c.operator_id, c.released_by_id})
    out = {
        "id": c.id, "clinicId": c.clinic_id, "steriliserId": c.steriliser_id, "steriliserName": st.name if st else None,
        "cycleNumber": c.cycle_number, "kind": c.kind, "program": c.program, "startedAt": c.started_at, "endedAt": c.ended_at,
        "temperatureC": c.temperature_c, "pressureBar": c.pressure_bar, "holdMinutes": c.hold_minutes,
        "chemicalIndicatorOk": c.chemical_indicator_ok, "testOk": c.test_ok, "biStatus": c.bi_status, "biLot": c.bi_lot,
        "biReadAt": c.bi_read_at, "result": c.result, "failureReason": c.failure_reason, "notes": c.notes,
        "operatorName": names.get(c.operator_id or ""), "releasedByName": names.get(c.released_by_id or ""),
        "packCount": len(packs), "packsUsed": sum(1 for p in packs if p.status == "used"),
    }
    if with_packs:
        patients = {p.id: p for p in db.scalars(select(Patient).where(Patient.id.in_({x.patient_id for x in packs if x.patient_id})))} if any(x.patient_id for x in packs) else {}
        out["packs"] = [_pack_out(p, c, st, patients.get(p.patient_id or "")) for p in packs]
    return out


# ---------------------------------------------------------------------------
# Overview and settings
# ---------------------------------------------------------------------------

@router.get("/sterilisation/overview")
def overview(db: DbSession, user: StaffUser, clinic_id: str | None = Query(default=None, alias="clinicId")):
    if svc.expire_packs(db):
        db.commit()
    return svc.overview(db, _scope(user, clinic_id))


@router.get("/sterilisation/settings")
def get_settings_(db: DbSession, user: StaffUser):
    return svc.settings(db)


@router.put("/sterilisation/settings")
def put_settings(body: SterilisationSettings, db: DbSession, user: User = Admins):
    result = svc.save_settings(db, body.model_dump(by_alias=True, exclude_unset=True))
    audit.record(db, user, "update", "sterilisation_settings", "sterilisation_settings", after=result)
    db.commit()
    return result


# ---------------------------------------------------------------------------
# Sterilisers
# ---------------------------------------------------------------------------

@router.post("/sterilisers", status_code=201)
def add_steriliser(body: SteriliserIn, db: DbSession, user: User = Admins):
    clinic_id = body.clinic_id or user.clinic_id
    if not clinic_id:
        raise bad_request("Select the clinic", "CLINIC_REQUIRED")
    ensure_clinic_access(user, clinic_id)
    st = Steriliser(clinic_id=clinic_id, **body.model_dump(exclude={"clinic_id"}))
    db.add(st)
    db.flush()
    audit.record(db, user, "create", "steriliser", st.id, after=body)
    db.commit()
    return {"id": st.id}


@router.patch("/sterilisers/{steriliser_id}")
def update_steriliser(steriliser_id: str, body: SteriliserUpdate, db: DbSession, user: User = Admins):
    st = _steriliser(db, user, steriliser_id)
    data = body.model_dump(exclude_unset=True)
    note = data.pop("note", None)
    if data.get("is_active") is True and not st.is_active:
        # Back in service: make sure it was serviced or retested.
        if not (data.get("last_serviced_on") or note):
            raise bad_request("Add the service date or a note on how it was fixed before putting it back in use", "NOTE_REQUIRED")
        st.out_of_service_reason = None
    elif data.get("is_active") is False:
        st.out_of_service_reason = note or "Taken out of service"
    for k, v in data.items():
        setattr(st, k, v)
    audit.record(db, user, "update", "steriliser", st.id, after={**body.model_dump(mode="json", exclude_unset=True)})
    db.commit()
    return {"id": st.id}


# ---------------------------------------------------------------------------
# Cycles
# ---------------------------------------------------------------------------

@router.get("/sterilisation/cycles")
def list_cycles(db: DbSession, user: StaffUser, clinic_id: str | None = Query(default=None, alias="clinicId"),
                steriliser_id: str | None = Query(default=None, alias="steriliserId"),
                result: str | None = None, start: date | None = Query(default=None, alias="from"),
                end: date | None = Query(default=None, alias="to"), limit: int = Query(default=100, ge=1, le=500)):
    scope = _scope(user, clinic_id)
    q = select(SterilisationCycle)
    if scope is not None:
        q = q.where(SterilisationCycle.clinic_id.in_(scope))
    if steriliser_id:
        q = q.where(SterilisationCycle.steriliser_id == steriliser_id)
    if result:
        q = q.where(SterilisationCycle.result.in_(result.split(",")))
    if start:
        q = q.where(SterilisationCycle.started_at >= datetime.combine(start, time.min, tzinfo=timezone.utc))
    if end:
        q = q.where(SterilisationCycle.started_at < datetime.combine(end + timedelta(days=1), time.min, tzinfo=timezone.utc))
    cycles = list(db.scalars(q.order_by(SterilisationCycle.started_at.desc()).limit(limit)))
    names = _names(db, {c.operator_id for c in cycles} | {c.released_by_id for c in cycles})
    return [_cycle_out(db, c, names) for c in cycles]


@router.post("/sterilisation/cycles", status_code=201)
def start_cycle(body: CycleStart, db: DbSession, user: StaffUser):
    st = _steriliser(db, user, body.steriliser_id)
    try:
        cycle, warnings = svc.start_cycle(db, st, body.kind, user, body.program, [p.model_dump() for p in body.packs], body.notes)
    except svc.SterilisationError as e:
        raise _err(e)
    if body.bi_lot:
        cycle.bi_lot, cycle.bi_status = body.bi_lot, "pending"
    audit.record(db, user, "start_cycle", "sterilisation_cycle", cycle.id,
                 after={"steriliser": st.name, "kind": body.kind, "packs": sum(p.count for p in body.packs)})
    db.commit()
    return {**_cycle_out(db, cycle, with_packs=True), "warnings": warnings}


@router.get("/sterilisation/cycles/{cycle_id}")
def get_cycle(cycle_id: str, db: DbSession, user: StaffUser):
    return _cycle_out(db, _cycle(db, user, cycle_id), with_packs=True)


@router.post("/sterilisation/cycles/{cycle_id}/result")
def cycle_result(cycle_id: str, body: CycleResult, db: DbSession, user: StaffUser):
    c = _cycle(db, user, cycle_id)
    try:
        warnings = svc.record_result(db, c, user, **body.model_dump())
    except svc.SterilisationError as e:
        raise _err(e)
    audit.record(db, user, "cycle_result", "sterilisation_cycle", c.id, after=body)
    db.commit()
    return {**_cycle_out(db, c, with_packs=True), "warnings": warnings}


@router.post("/sterilisation/cycles/{cycle_id}/spore-result")
def spore_result(cycle_id: str, body: SporeResult, db: DbSession, user: StaffUser):
    c = _cycle(db, user, cycle_id)
    try:
        outcome = svc.record_spore_result(db, c, user, body.passed, body.note)
    except svc.SterilisationError as e:
        raise _err(e)
    audit.record(db, user, "spore_result", "sterilisation_cycle", c.id, after={"passed": body.passed, "recalled": outcome["recalled"]})
    db.commit()
    return {**_cycle_out(db, c, with_packs=True), **outcome}


@router.get("/sterilisation/cycles/{cycle_id}/exposure")
def cycle_exposure(cycle_id: str, db: DbSession, user: User = Admins):
    """Patients who had packs from this cycle (for a failed cycle or spore test)."""
    return svc.exposure(db, _cycle(db, user, cycle_id))


@router.get("/sterilisation/register.csv")
def register_csv(db: DbSession, user: StaffUser, clinic_id: str | None = Query(default=None, alias="clinicId"),
                 start: date | None = Query(default=None, alias="from"), end: date | None = Query(default=None, alias="to")):
    """The sterilisation log book, for inspections."""
    end = end or date.today()
    start = start or end.replace(day=1)
    rows = list_cycles(db, user, clinic_id, None, None, start, end, 500)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Date", "Time", "Steriliser", "Cycle", "Type", "Program", "Temp °C", "Pressure bar", "Hold min",
                "Indicator", "Test", "Spore test", "Result", "Reason", "Packs", "Used", "Operator", "Released by"])
    zones: dict = {}
    for c in reversed(rows):
        if c["clinicId"] not in zones:
            zones[c["clinicId"]] = clinic_tz(db.get(Clinic, c["clinicId"]))
        at = as_utc(c["startedAt"]).astimezone(zones[c["clinicId"]])
        w.writerow([at.strftime("%Y-%m-%d"), at.strftime("%H:%M"), c["steriliserName"], c["cycleNumber"], c["kind"], c["program"] or "",
                    c["temperatureC"] or "", c["pressureBar"] or "", c["holdMinutes"] or "",
                    {True: "OK", False: "FAIL", None: ""}[c["chemicalIndicatorOk"]], {True: "PASS", False: "FAIL", None: ""}[c["testOk"]],
                    c["biStatus"] if c["biStatus"] != "none" else "", c["result"], c["failureReason"] or "", c["packCount"],
                    c["packsUsed"], c["operatorName"] or "", c["releasedByName"] or ""])
    name = f"sterilisation-register-{start}-to-{end}.csv"
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ---------------------------------------------------------------------------
# Packs
# ---------------------------------------------------------------------------

@router.get("/sterilisation/packs")
def list_packs(db: DbSession, user: StaffUser, clinic_id: str | None = Query(default=None, alias="clinicId"),
               status: str | None = None, limit: int = Query(default=200, ge=1, le=1000)):
    scope = _scope(user, clinic_id)
    q = select(InstrumentPack)
    if scope is not None:
        q = q.where(InstrumentPack.clinic_id.in_(scope))
    if status:
        q = q.where(InstrumentPack.status.in_(status.split(",")))
    packs = list(db.scalars(q.order_by(InstrumentPack.expires_on, InstrumentPack.created_at).limit(limit)))
    cycles = {c.id: c for c in db.scalars(select(SterilisationCycle).where(SterilisationCycle.id.in_({p.cycle_id for p in packs})))} if packs else {}
    sts = {s.id: s for s in db.scalars(select(Steriliser).where(Steriliser.id.in_({c.steriliser_id for c in cycles.values()})))} if cycles else {}
    pats = {p.id: p for p in db.scalars(select(Patient).where(Patient.id.in_({x.patient_id for x in packs if x.patient_id})))} if any(x.patient_id for x in packs) else {}
    return [_pack_out(p, cycles.get(p.cycle_id), sts.get(cycles[p.cycle_id].steriliser_id) if p.cycle_id in cycles else None,
                      pats.get(p.patient_id or "")) for p in packs]


def _pack_by_code(db, user: User, code: str) -> InstrumentPack:
    pack = db.scalars(select(InstrumentPack).where(InstrumentPack.code == svc.normalise_code(code))).first()
    if not pack:
        raise AppError(404, "No pack with this code. Check the label.", "PACK_NOT_FOUND")
    ensure_clinic_access(user, pack.clinic_id)
    return pack


@router.get("/sterilisation/packs/lookup")
def lookup_pack(code: str, db: DbSession, user: StaffUser):
    pack = _pack_by_code(db, user, code)
    cycle = db.get(SterilisationCycle, pack.cycle_id)
    st = db.get(Steriliser, cycle.steriliser_id) if cycle else None
    patient = db.get(Patient, pack.patient_id) if pack.patient_id else None
    return _pack_out(pack, cycle, st, patient)


@router.post("/sterilisation/packs/use")
def use_pack(body: UsePack, db: DbSession, user: User = Depends(require_roles("super_admin", "admin", "dentist", "receptionist"))):
    """Record that a pack was opened for a patient. Refuses packs that aren't safe to use."""
    pack = _pack_by_code(db, user, body.code)
    appt = db.get(Appointment, body.appointment_id) if body.appointment_id else None
    if body.appointment_id and not appt:
        raise not_found("Appointment")
    patient_id = appt.patient_id if appt else body.patient_id
    if not patient_id:
        raise bad_request("Choose the patient or appointment", "PATIENT_REQUIRED")
    from app.api.patients import get_patient_for

    patient = get_patient_for(db, user, patient_id)
    if appt:
        ensure_clinic_access(user, appt.clinic_id)
    try:
        svc.use_pack(db, pack, user, appt, patient)
    except svc.SterilisationError as e:
        db.commit()  # keep an "expired" status change
        raise _err(e)
    audit.record(db, user, "use_pack", "instrument_pack", pack.id, after={"patientId": patient.id, "appointmentId": body.appointment_id})
    db.commit()
    return lookup_pack(pack.code, db, user)


@router.patch("/sterilisation/packs/{pack_id}")
def set_pack_status(pack_id: str, body: PackStatusIn, db: DbSession, user: StaffUser):
    pack = db.get(InstrumentPack, pack_id)
    if not pack:
        raise not_found("Pack")
    ensure_clinic_access(user, pack.clinic_id)
    if pack.status == "used":
        raise bad_request("A used pack stays in the record", "PACK_USED")
    pack.status, pack.status_note = body.status, body.note
    audit.record(db, user, "pack_status", "instrument_pack", pack.id, after=body)
    db.commit()
    return {"id": pack.id, "status": pack.status}


@router.get("/patients/{patient_id}/instrument-packs")
def patient_packs(patient_id: str, db: DbSession, user: StaffUser):
    from app.api.patients import get_patient_for

    patient = get_patient_for(db, user, patient_id)
    packs = list(db.scalars(select(InstrumentPack).where(InstrumentPack.patient_id == patient.id).order_by(InstrumentPack.used_at.desc())))
    out = []
    for p in packs:
        c = db.get(SterilisationCycle, p.cycle_id)
        out.append(_pack_out(p, c, db.get(Steriliser, c.steriliser_id) if c else None, patient))
    return out
