"""AI assistant endpoints. Drafts only: clinicians review and save them."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy import func, select

from app.api.patients import get_patient_for
from app.core.config import get_settings
from app.core.deps import DbSession, StaffUser, require_roles
from app.core.errors import AppError, bad_request, not_found
from app.models import Appointment, AuditLog, Patient, TreatmentPlan, User
from app.schemas import CamelModel
from app.services import ai, audit

router = APIRouter(tags=["ai"])
Clinicians = Depends(require_roles("dentist", "admin", "super_admin"))
AI_ACTIONS = ("ai_soap", "ai_explain")


class AiStatus(CamelModel):
    enabled: bool
    provider: str
    model: str | None
    demo: bool


class SoapIn(CamelModel):
    patient_id: str
    transcript: str = Field(min_length=10, max_length=20000)
    appointment_id: str | None = None


class SoapOut(CamelModel):
    subjective: str
    objective: str
    assessment: str
    plan: str
    teeth: list[str]
    follow_up: str
    needs_checking: list[str]
    demo: bool


class ExplainIn(CamelModel):
    language: str = Field(default="en", pattern="^(en|hi|mr)$")


class ExplanationStep(CamelModel):
    name: str = Field(max_length=300)
    why: str = Field(max_length=2000)
    what_to_expect: str = Field(max_length=2000)


class ExplanationIn(CamelModel):
    language: str = Field(pattern="^(en|hi|mr)$")
    summary: str = Field(min_length=1, max_length=3000)
    steps: list[ExplanationStep] = Field(max_length=30)
    aftercare: str = Field(default="", max_length=3000)
    questions: list[str] = Field(default_factory=list, max_length=10)
    shared: bool = False


def _context(patient) -> dict:
    history = patient.medical_history or {}
    return {
        "age": ai.age_band(patient.dob), "sex": patient.gender,
        "allergies": ", ".join(history.get("allergies") or []) or None,
        "conditions": ", ".join(history.get("chronicConditions") or []) or None,
        "current medicines": ", ".join(history.get("medications") or []) or None,
    }


def _rate_limit(db, user: User) -> None:
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    used = db.scalar(select(func.count()).select_from(AuditLog).where(
        AuditLog.actor_user_id == user.id, AuditLog.action.in_(AI_ACTIONS), AuditLog.timestamp >= since)) or 0
    if used >= get_settings().ai_requests_per_hour:
        raise AppError(429, "You've reached the hourly limit for the AI assistant. Try again later.", "AI_RATE_LIMITED")


def _plan(db, user: User, plan_id: str) -> TreatmentPlan:
    plan = db.get(TreatmentPlan, plan_id)
    if not plan:
        raise not_found("Treatment plan")
    get_patient_for(db, user, plan.patient_id)
    return plan


@router.get("/ai/status", response_model=AiStatus)
def status(user: StaffUser):
    s = get_settings()
    return AiStatus(enabled=s.ai_ready, provider=s.ai_provider, model=s.ai_model if s.ai_provider == "anthropic" else None,
                    demo=s.ai_provider == "mock")


@router.post("/ai/soap-draft", response_model=SoapOut)
def soap_draft(body: SoapIn, db: DbSession, user: User = Clinicians):
    """Turn a dictated or typed visit summary into a SOAP note draft. Nothing is saved."""
    patient = get_patient_for(db, user, body.patient_id)
    _rate_limit(db, user)
    context = _context(patient)
    if body.appointment_id:
        appt = db.get(Appointment, body.appointment_id)
        if appt and appt.patient_id == patient.id:
            context["visit"] = appt.procedure_type
    draft = ai.soap_draft(body.transcript, names=[patient.first_name, patient.last_name,
                                                  f"{patient.first_name} {patient.last_name}"], context=context)
    # Audit that it happened, never what was said.
    audit.record(db, user, "ai_soap", "patient", patient.id, after={"chars": len(body.transcript), "provider": get_settings().ai_provider})
    db.commit()
    return SoapOut(**{**draft, "follow_up": draft["followUp"], "needs_checking": draft["needsChecking"]},
                   demo=get_settings().ai_provider == "mock")


@router.post("/treatment-plans/{plan_id}/explanation/draft")
def explanation_draft(plan_id: str, body: ExplainIn, db: DbSession, user: User = Clinicians):
    """Write a plain-language explanation of the plan in English, Hindi or Marathi. Not saved until reviewed."""
    plan = _plan(db, user, plan_id)
    if not plan.items:
        raise bad_request("Add treatment to the plan first", "EMPTY_PLAN")
    _rate_limit(db, user)
    patient = db.get(Patient, plan.patient_id)
    items = [{"name": i.procedure_name, "tooth": i.tooth_number, "status": i.status} for i in plan.items]
    out = ai.explain_plan(plan.name, items, body.language, _context(patient))
    audit.record(db, user, "ai_explain", "treatment_plan", plan.id, after={"language": body.language, "provider": get_settings().ai_provider})
    db.commit()
    return {**out, "language": body.language, "demo": get_settings().ai_provider == "mock"}


@router.put("/treatment-plans/{plan_id}/explanation")
def save_explanation(plan_id: str, body: ExplanationIn, db: DbSession, user: User = Clinicians):
    """Save the reviewed explanation. shared=true shows it to the patient in their portal."""
    plan = _plan(db, user, plan_id)
    now = datetime.now(timezone.utc).isoformat()
    previous = plan.patient_explanation or {}
    plan.patient_explanation = {
        "language": body.language, "summary": body.summary.strip(),
        "steps": [{"name": s.name, "why": s.why, "whatToExpect": s.what_to_expect} for s in body.steps],
        "aftercare": body.aftercare.strip(), "questions": [q.strip() for q in body.questions if q.strip()],
        "shared": body.shared, "sharedAt": now if body.shared and not previous.get("shared") else previous.get("sharedAt") if body.shared else None,
        "reviewedBy": f"Dr. {user.first_name} {user.last_name}".strip() if user.role == "dentist" else f"{user.first_name} {user.last_name}".strip(),
        "updatedAt": now,
    }
    audit.record(db, user, "save_explanation", "treatment_plan", plan.id, after={"language": body.language, "shared": body.shared})
    db.commit()
    return plan.patient_explanation


@router.delete("/treatment-plans/{plan_id}/explanation", status_code=204)
def delete_explanation(plan_id: str, db: DbSession, user: User = Clinicians):
    plan = _plan(db, user, plan_id)
    plan.patient_explanation = None
    audit.record(db, user, "delete_explanation", "treatment_plan", plan.id)
    db.commit()
