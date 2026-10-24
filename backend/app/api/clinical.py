"""Dental chart, periodontal readings, treatment plans and SOAP notes."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.patients import get_patient_for, portal_patient_ids
from app.core.config import get_settings
from app.core.deps import DbSession, accessible_clinic_ids, ensure_clinic_access, require_roles
from app.core.errors import bad_request, forbidden, not_found
from app.models import (
    ClinicalNote,
    Invoice,
    Patient,
    PerioReading,
    Procedure,
    ToothEvent,
    ToothRecord,
    TreatmentPlan,
    TreatmentPlanItem,
    User,
    utcnow,
)
from app.schemas import (
    VALID_FDI,
    DentalChartOut,
    InvoiceDetailOut,
    NoteIn,
    NoteOut,
    PerioExamIn,
    PerioOut,
    PlanIn,
    PlanItemIn,
    PlanItemOut,
    PlanItemStatusIn,
    PlanOut,
    PlanUpdate,
    ToothHistoryOut,
    ToothRecordOut,
    ToothUpdate,
)
from app.services import audit
from app.services import billing as billing_svc
from app.services.scheduling import as_utc

router = APIRouter(tags=["clinical"])

Clinicians = Depends(require_roles("dentist", "admin"))
ChartReaders = Depends(require_roles("dentist", "admin", "super_admin"))
PlanReaders = Depends(require_roles("dentist", "admin", "super_admin", "receptionist"))
Invoicers = Depends(require_roles("dentist", "admin", "super_admin", "receptionist"))

NOTE_EDIT_WINDOW = timedelta(hours=24)

PLAN_TRANSITIONS: dict[str, set[str]] = {
    "Draft": {"Proposed", "Approved"},
    "Proposed": {"Draft", "Approved"},
    "Approved": {"Proposed", "In Progress", "Completed"},
    "In Progress": {"Completed"},
    "Completed": set(),
}


def _name(user: User | None) -> str:
    if not user:
        return "Unknown"
    prefix = "Dr. " if user.role in ("dentist", "admin") else ""
    return f"{prefix}{user.first_name} {user.last_name}".strip()


def _check_tooth(tooth: str) -> str:
    if tooth not in VALID_FDI:
        raise bad_request(f"{tooth} is not a valid FDI tooth number", "INVALID_TOOTH")
    return tooth


def _teeth_in(text: str | None) -> list[str]:
    """'16, 17' -> ['16', '17'] (only valid FDI numbers)."""
    if not text:
        return []
    parts = [p.strip() for p in text.replace(";", ",").replace(" ", ",").split(",")]
    return [p for p in parts if p in VALID_FDI]


# ---------------------------------------------------------------------------
# Dental chart
# ---------------------------------------------------------------------------

def _chart(db: Session, patient: Patient, as_of: datetime | None) -> DentalChartOut:
    users = {u.id: u for u in db.scalars(select(User))}
    events = db.scalars(
        select(ToothEvent).where(ToothEvent.patient_id == patient.id).order_by(ToothEvent.created_at)
    ).all()
    if as_of:
        events = [e for e in events if as_utc(e.created_at) <= as_of]

    history: dict[str, list[ToothEvent]] = {}
    for e in events:
        history.setdefault(e.tooth_number, []).append(e)

    records: list[ToothRecordOut] = []
    if as_of:
        for tooth, evs in history.items():
            last = evs[-1]
            records.append(ToothRecordOut(
                id=last.id, patient_id=patient.id, tooth_number=tooth, conditions=last.conditions, notes=last.notes,
                history=[ToothHistoryOut(id=e.id, date=e.created_at, action=e.action, dentist=_name(users.get(e.author_id)))
                         for e in reversed(evs)],
                recorded_by_staff_id=last.author_id, recorded_at=last.created_at,
            ))
    else:
        seen: set[str] = set()
        for rec in db.scalars(select(ToothRecord).where(ToothRecord.patient_id == patient.id)):
            seen.add(rec.tooth_number)
            evs = history.get(rec.tooth_number, [])
            records.append(ToothRecordOut(
                id=rec.id, patient_id=patient.id, tooth_number=rec.tooth_number, conditions=rec.conditions,
                notes=rec.notes,
                history=[ToothHistoryOut(id=e.id, date=e.created_at, action=e.action, dentist=_name(users.get(e.author_id)))
                         for e in reversed(evs)],
                recorded_by_staff_id=rec.updated_by_id, recorded_at=rec.updated_at,
            ))
        # Teeth that only have history (e.g. a completed plan item) still show up.
        for tooth, evs in history.items():
            if tooth in seen:
                continue
            last = evs[-1]
            records.append(ToothRecordOut(
                id=last.id, patient_id=patient.id, tooth_number=tooth, conditions=last.conditions, notes=last.notes,
                history=[ToothHistoryOut(id=e.id, date=e.created_at, action=e.action, dentist=_name(users.get(e.author_id)))
                         for e in reversed(evs)],
                recorded_by_staff_id=last.author_id, recorded_at=last.created_at,
            ))

    perio_q = select(PerioReading).where(PerioReading.patient_id == patient.id).order_by(PerioReading.recorded_at)
    latest: dict[str, PerioReading] = {}
    perio_dates: set[str] = set()
    for r in db.scalars(perio_q):
        perio_dates.add(as_utc(r.recorded_at).date().isoformat())
        if as_of and as_utc(r.recorded_at) > as_of:
            continue
        latest[r.tooth_number] = r

    dates = {as_utc(e.created_at).date().isoformat() for e in db.scalars(
        select(ToothEvent).where(ToothEvent.patient_id == patient.id))} | perio_dates
    return DentalChartOut(
        records=sorted(records, key=lambda r: r.tooth_number),
        perio=[PerioOut.model_validate(r) for r in latest.values()],
        as_of=as_of,
        exam_dates=sorted(dates, reverse=True),
    )


@router.get("/patients/{patient_id}/dental-chart", response_model=DentalChartOut)
def get_dental_chart(
    patient_id: str,
    db: DbSession,
    user: User = ChartReaders,
    as_of: str | None = Query(default=None, alias="asOf", description="YYYY-MM-DD: show the chart as it was at the end of that day"),
):
    patient = get_patient_for(db, user, patient_id)
    cutoff = None
    if as_of:
        try:
            cutoff = datetime.fromisoformat(as_of[:10]).replace(tzinfo=timezone.utc) + timedelta(days=1) - timedelta(microseconds=1)
        except ValueError:
            raise bad_request("asOf must be YYYY-MM-DD", "INVALID_DATE")
    return _chart(db, patient, cutoff)


@router.put("/patients/{patient_id}/dental-chart/teeth/{tooth}", response_model=ToothRecordOut)
def update_tooth(patient_id: str, tooth: str, body: ToothUpdate, db: DbSession, user: User = Clinicians):
    patient = get_patient_for(db, user, patient_id)
    _check_tooth(tooth)
    conditions = list(dict.fromkeys(body.conditions))  # de-duplicate, keep order
    if len(conditions) > 1 and "Healthy" in conditions:
        conditions.remove("Healthy")
    rec = db.scalars(select(ToothRecord).where(ToothRecord.patient_id == patient.id, ToothRecord.tooth_number == tooth)).first()
    before = list(rec.conditions) if rec else ["Healthy"]
    if rec is None:
        rec = ToothRecord(patient_id=patient.id, tooth_number=tooth)
        db.add(rec)
    rec.conditions, rec.notes, rec.updated_by_id = conditions, body.notes, user.id

    added = [c for c in conditions if c not in before and c != "Healthy"]
    removed = [c for c in before if c not in conditions and c != "Healthy"]
    action = body.action or (
        "; ".join(filter(None, [
            f"Marked {', '.join(added)}" if added else "",
            f"Cleared {', '.join(removed)}" if removed else "",
        ])) or "Notes updated"
    )
    db.add(ToothEvent(patient_id=patient.id, tooth_number=tooth, action=action, conditions=conditions,
                      notes=body.notes, author_id=user.id))
    audit.record(db, user, "update_tooth", "patient", patient.id, after={"tooth": tooth, "conditions": conditions})
    db.commit()
    return next(r for r in _chart(db, patient, None).records if r.tooth_number == tooth)


@router.post("/patients/{patient_id}/dental-chart/perio", response_model=list[PerioOut], status_code=201)
def record_perio(patient_id: str, body: PerioExamIn, db: DbSession, user: User = Clinicians):
    """Record a periodontal exam (one or more teeth). Earlier readings are kept for comparison."""
    patient = get_patient_for(db, user, patient_id)
    now = utcnow()
    rows = []
    for r in body.readings:
        _check_tooth(r.tooth_number)
        row = PerioReading(patient_id=patient.id, tooth_number=r.tooth_number,
                           measurement_points={"buccal": r.buccal, "lingual": r.lingual},
                           bleeding_on_probing=r.bleeding_on_probing, recorded_by_id=user.id, recorded_at=now)
        db.add(row)
        rows.append(row)
    audit.record(db, user, "perio_exam", "patient", patient.id, after={"teeth": len(rows)})
    db.commit()
    return [PerioOut.model_validate(r) for r in rows]


# ---------------------------------------------------------------------------
# Treatment plans
# ---------------------------------------------------------------------------

def _plan_out(db: Session, plan: TreatmentPlan) -> PlanOut:
    rate = get_settings().default_gst_rate
    lines = [{"procedureName": i.procedure_name, "quantity": 1, "unitCost": float(i.cost), "taxable": i.taxable}
             for i in plan.items]
    if lines:
        t = billing_svc.compute_totals(lines, plan.discount, plan.discount_type, rate, False)
        subtotal, disc, tax, total = t["subtotal"], t["discount_amount"], t["total_tax"], t["total"]
    else:
        subtotal = disc = tax = total = 0
    patient = db.get(Patient, plan.patient_id)
    author = db.get(User, plan.created_by_id) if plan.created_by_id else None
    return PlanOut(
        id=plan.id, patient_id=plan.patient_id,
        patient_name=f"{patient.first_name} {patient.last_name}".strip() if patient else None,
        clinic_id=plan.clinic_id, name=plan.name, status=plan.status, discount=float(plan.discount),
        discount_type=plan.discount_type, discount_reason=plan.discount_reason,
        tax_percentage=rate if any(i.taxable for i in plan.items) else 0, notes=plan.notes,
        items=[PlanItemOut.model_validate(i) for i in plan.items],
        subtotal=float(subtotal), discount_amount=float(disc), estimated_tax=float(tax), estimated_total=float(total),
        completed_count=sum(1 for i in plan.items if i.status == "Completed"),
        created_by_staff_id=plan.created_by_id, created_by_name=_name(author) if author else None,
        created_at=plan.created_at, approved_at=plan.approved_at, invoice_id=plan.invoice_id,
        patient_explanation=plan.patient_explanation,
    )


def _get_plan(db: Session, user: User, plan_id: str) -> TreatmentPlan:
    plan = db.get(TreatmentPlan, plan_id)
    if not plan:
        raise not_found("Treatment plan")
    if user.role == "patient":
        if plan.patient_id not in portal_patient_ids(db, user) or plan.status == "Draft":
            raise not_found("Treatment plan")
    else:
        allowed = accessible_clinic_ids(user)
        if allowed is not None and plan.clinic_id not in allowed:
            raise not_found("Treatment plan")
    return plan


def _apply_items(db: Session, plan: TreatmentPlan, items: list[PlanItemIn]) -> None:
    procs = {p.id: p for p in db.scalars(select(Procedure))}
    existing = {i.id: i for i in plan.items}
    new_items = []
    for n, it in enumerate(items):
        proc = procs.get(it.procedure_id) if it.procedure_id else None
        name = (it.procedure_name or (proc.name if proc else "")).strip()
        if not name:
            raise bad_request("Each item needs a procedure", "INVALID_ITEM")
        row = existing.pop(it.id, None) if it.id else None
        if row is None:
            row = TreatmentPlanItem()
        row.procedure_id = proc.id if proc else None
        row.procedure_name = name
        row.tooth_number = (it.tooth_number or "").strip() or None
        row.cost = billing_svc.money(it.cost)
        row.taxable = it.taxable if it.taxable is not None else bool(proc and proc.gst_applicable)
        row.status = it.status
        row.linked_appointment_id = it.linked_appointment_id
        row.sort_order = n
        new_items.append(row)
    plan.items = new_items  # removed rows are deleted (delete-orphan)


def _refresh_plan_status(plan: TreatmentPlan) -> None:
    if plan.status not in ("Approved", "In Progress"):
        return
    if plan.items and all(i.status == "Completed" for i in plan.items):
        plan.status = "Completed"
    elif any(i.status != "Pending" for i in plan.items):
        plan.status = "In Progress"


@router.get("/treatment-plans", response_model=list[PlanOut])
def list_plans(
    db: DbSession,
    user: User = PlanReaders,
    status: str | None = None,
    mine: bool = False,
    clinic_id: str | None = Query(default=None, alias="clinicId"),
):
    """Plans across patients, e.g. a dentist's proposed plans waiting for patient approval."""
    query = select(TreatmentPlan).order_by(TreatmentPlan.updated_at.desc())
    allowed = accessible_clinic_ids(user)
    if allowed is not None:
        query = query.where(TreatmentPlan.clinic_id.in_(allowed))
    if clinic_id and clinic_id != "all":
        query = query.where(TreatmentPlan.clinic_id == clinic_id)
    if status:
        query = query.where(TreatmentPlan.status.in_(status.split(",")))
    if mine:
        query = query.where(TreatmentPlan.created_by_id == user.id)
    return [_plan_out(db, p) for p in db.scalars(query.limit(300))]


@router.get("/patients/{patient_id}/treatment-plans", response_model=list[PlanOut])
def patient_plans(patient_id: str, db: DbSession, user: User = PlanReaders):
    patient = get_patient_for(db, user, patient_id)
    plans = db.scalars(select(TreatmentPlan).where(TreatmentPlan.patient_id == patient.id)
                       .order_by(TreatmentPlan.created_at.desc())).all()
    out = [_plan_out(db, p) for p in plans]
    for o in out:  # patients only see an explanation once the dentist has shared it
        if not (o.patient_explanation or {}).get("shared"):
            o.patient_explanation = None
    return out


@router.post("/patients/{patient_id}/treatment-plans", response_model=PlanOut, status_code=201)
def create_plan(patient_id: str, body: PlanIn, db: DbSession, user: User = Clinicians):
    patient = get_patient_for(db, user, patient_id)
    clinic_id = patient.clinic_id or user.clinic_id
    ensure_clinic_access(user, clinic_id)
    plan = TreatmentPlan(patient_id=patient.id, clinic_id=clinic_id, name=body.name, status=body.status,
                         discount=billing_svc.money(body.discount), discount_type=body.discount_type,
                         discount_reason=body.discount_reason, notes=body.notes, created_by_id=user.id)
    db.add(plan)
    _apply_items(db, plan, body.items)
    db.flush()
    audit.record(db, user, "create", "treatment_plan", plan.id, after={"name": plan.name, "items": len(plan.items)})
    db.commit()
    return _plan_out(db, plan)


@router.get("/treatment-plans/{plan_id}", response_model=PlanOut)
def get_plan(plan_id: str, db: DbSession, user: User = Depends(require_roles("dentist", "admin", "super_admin", "receptionist", "patient"))):
    return _plan_out(db, _get_plan(db, user, plan_id))


@router.patch("/treatment-plans/{plan_id}", response_model=PlanOut)
def update_plan(plan_id: str, body: PlanUpdate, db: DbSession, user: User = Clinicians):
    plan = _get_plan(db, user, plan_id)
    data = body.model_dump(exclude_unset=True)
    editable = plan.status in ("Draft", "Proposed")
    if not editable and ({"items", "discount", "discount_type"} & data.keys()):
        raise bad_request("Approved plans can't be re-priced. Move it back to Proposed first.", "PLAN_LOCKED")
    if body.items is not None:
        _apply_items(db, plan, body.items)
    for key in ("name", "discount_reason", "notes", "discount_type"):
        if key in data and data[key] is not None:
            setattr(plan, key, data[key])
    if data.get("discount") is not None:
        plan.discount = billing_svc.money(data["discount"])
    new_status = data.get("status")
    if new_status and new_status != plan.status:
        if new_status not in PLAN_TRANSITIONS[plan.status]:
            raise bad_request(f"A {plan.status.lower()} plan can't move to {new_status.lower()}", "INVALID_TRANSITION")
        if new_status == "Approved":
            if not plan.items:
                raise bad_request("Add at least one procedure before approval", "PLAN_EMPTY")
            plan.approved_at = utcnow()
        if new_status == "Proposed":
            plan.approved_at = None
        plan.status = new_status
    db.flush()
    _refresh_plan_status(plan)
    audit.record(db, user, "update", "treatment_plan", plan.id, after={"status": plan.status})
    db.commit()
    return _plan_out(db, plan)


@router.patch("/treatment-plans/{plan_id}/items/{item_id}", response_model=PlanOut)
def update_plan_item(plan_id: str, item_id: str, body: PlanItemStatusIn, db: DbSession, user: User = Clinicians):
    """Mark a planned procedure scheduled or done. Completing it also writes to the tooth history."""
    plan = _get_plan(db, user, plan_id)
    if plan.status not in ("Approved", "In Progress", "Completed"):
        raise bad_request("Approve the plan before recording treatment", "PLAN_NOT_APPROVED")
    item = next((i for i in plan.items if i.id == item_id), None)
    if not item:
        raise not_found("Plan item")
    was = item.status
    item.status = body.status
    if body.linked_appointment_id is not None:
        item.linked_appointment_id = body.linked_appointment_id or None
    item.completed_at = utcnow() if body.status == "Completed" else None
    if body.status == "Completed" and was != "Completed":
        for tooth in _teeth_in(item.tooth_number):
            rec = db.scalars(select(ToothRecord).where(ToothRecord.patient_id == plan.patient_id,
                                                       ToothRecord.tooth_number == tooth)).first()
            db.add(ToothEvent(patient_id=plan.patient_id, tooth_number=tooth, action=f"{item.procedure_name} completed",
                              conditions=list(rec.conditions) if rec else ["Healthy"], notes=rec.notes if rec else "",
                              author_id=user.id))
    if plan.status == "Completed" and body.status != "Completed":
        plan.status = "In Progress"
    _refresh_plan_status(plan)
    audit.record(db, user, "update_item", "treatment_plan", plan.id, after={"item": item.id, "status": item.status})
    db.commit()
    return _plan_out(db, plan)


@router.post("/treatment-plans/{plan_id}/invoice", response_model=InvoiceDetailOut, status_code=201)
def invoice_plan(plan_id: str, db: DbSession, user: User = Invoicers):
    """Turn an approved plan into a draft invoice (once; a voided invoice can be replaced)."""
    from app.api.billing import _detail  # local import to avoid a cycle

    plan = _get_plan(db, user, plan_id)
    if plan.status not in ("Approved", "In Progress", "Completed"):
        raise bad_request("Only approved plans can be invoiced", "PLAN_NOT_APPROVED")
    if plan.invoice_id:
        existing = db.get(Invoice, plan.invoice_id)
        if existing and existing.status != "Void":
            raise bad_request(f"This plan is already on invoice {existing.invoice_number}", "PLAN_ALREADY_INVOICED")
    lines = [{"procedureId": i.procedure_id, "procedureName": i.procedure_name, "toothNumber": i.tooth_number,
              "quantity": 1, "unitCost": float(i.cost), "taxable": i.taxable} for i in plan.items]
    totals = billing_svc.compute_totals(lines, plan.discount, plan.discount_type, get_settings().default_gst_rate, False)
    inv = Invoice(invoice_number=billing_svc.next_invoice_number(db), patient_id=plan.patient_id, clinic_id=plan.clinic_id,
                  treatment_plan_id=plan.id, due_date=utcnow() + timedelta(days=7), created_by_id=user.id,
                  dentist_id=billing_svc.default_dentist(db, plan.patient_id, plan.clinic_id, plan.id),
                  notes=f"Treatment plan: {plan.name}", status="Draft", **totals)
    db.add(inv)
    db.flush()
    plan.invoice_id = inv.id
    billing_svc.refresh_invoice(db, inv)
    audit.record(db, user, "invoice", "treatment_plan", plan.id, after={"invoice": inv.invoice_number})
    db.commit()
    return _detail(db, inv)


# ---------------------------------------------------------------------------
# Clinical notes
# ---------------------------------------------------------------------------

def _note_out(note: ClinicalNote, user: User, authors: dict[str, User]) -> NoteOut:
    editable = note.author_id == user.id and datetime.now(timezone.utc) - as_utc(note.created_at) < NOTE_EDIT_WINDOW
    return NoteOut(
        id=note.id, patient_id=note.patient_id, appointment_id=note.appointment_id, subjective=note.subjective,
        objective=note.objective, assessment=note.assessment, plan=note.plan, author_staff_id=note.author_id,
        author_name=_name(authors.get(note.author_id)), created_at=note.created_at, updated_at=note.updated_at,
        editable=editable,
    )


@router.get("/patients/{patient_id}/clinical-notes", response_model=list[NoteOut])
def list_notes(patient_id: str, db: DbSession, user: User = ChartReaders):
    patient = get_patient_for(db, user, patient_id)
    notes = db.scalars(select(ClinicalNote).where(ClinicalNote.patient_id == patient.id)
                       .order_by(ClinicalNote.created_at.desc())).all()
    authors = {u.id: u for u in db.scalars(select(User).where(User.id.in_({n.author_id for n in notes if n.author_id})))}
    return [_note_out(n, user, authors) for n in notes]


@router.post("/patients/{patient_id}/clinical-notes", response_model=NoteOut, status_code=201)
def add_note(patient_id: str, body: NoteIn, db: DbSession, user: User = Clinicians):
    patient = get_patient_for(db, user, patient_id)
    note = ClinicalNote(patient_id=patient.id, author_id=user.id, **body.model_dump())
    db.add(note)
    db.flush()
    audit.record(db, user, "create", "clinical_note", note.id)
    db.commit()
    return _note_out(note, user, {user.id: user})


@router.patch("/clinical-notes/{note_id}", response_model=NoteOut)
def edit_note(note_id: str, body: NoteIn, db: DbSession, user: User = Clinicians):
    note = db.get(ClinicalNote, note_id)
    if not note:
        raise not_found("Clinical note")
    get_patient_for(db, user, note.patient_id)
    if note.author_id != user.id:
        raise forbidden("Only the author can edit a note")
    if datetime.now(timezone.utc) - as_utc(note.created_at) >= NOTE_EDIT_WINDOW:
        raise bad_request("Notes are locked 24 hours after writing. Add a new note to correct the record.", "NOTE_LOCKED")
    before = {k: getattr(note, k) for k in ("subjective", "objective", "assessment", "plan")}
    for k, v in body.model_dump().items():
        setattr(note, k, v)
    audit.record(db, user, "update", "clinical_note", note.id, before=before)
    db.commit()
    return _note_out(note, user, {user.id: user})


# ---------------------------------------------------------------------------
# Patient portal: read-only view of the patient's own chart and plans
# ---------------------------------------------------------------------------

@router.get("/patient-portal/dental-chart", response_model=DentalChartOut)
def my_chart(db: DbSession, user: User = Depends(require_roles("patient")),
             patient_id: str | None = Query(default=None, alias="patientId")):
    if not user.patient_id:
        raise forbidden("This login is not linked to a patient record")
    patient = get_patient_for(db, user, patient_id or user.patient_id)  # a family member, for account holders
    return _chart(db, patient, None)


@router.get("/patient-portal/treatment-plans", response_model=list[PlanOut])
def my_plans(db: DbSession, user: User = Depends(require_roles("patient"))):
    if not user.patient_id:
        raise forbidden("This login is not linked to a patient record")
    plans = db.scalars(select(TreatmentPlan).where(TreatmentPlan.patient_id.in_(portal_patient_ids(db, user)),
                                                   TreatmentPlan.status != "Draft")
                       .order_by(TreatmentPlan.created_at.desc())).all()
    return [_plan_out(db, p) for p in plans]
