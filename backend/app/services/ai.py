"""AI assistant: turn a dictated visit into a draft SOAP note, and explain a treatment plan to the patient.

Everything here produces a DRAFT for the dentist to check. Nothing is saved to the record until a
clinician saves it themselves.

Privacy: the patient's name and phone number are never sent. Names in the dictation are replaced with
"the patient" before the request, and only clinical details (age band, sex, allergies, conditions,
procedures, teeth) are included.
"""

import logging
import re
from datetime import date

import httpx

from app.core.config import get_settings
from app.core.errors import AppError

log = logging.getLogger("dentassist.ai")

LANGUAGES = {"en": "English", "hi": "Hindi (Devanagari script)", "mr": "Marathi (Devanagari script)"}

SOAP_TOOL = {
    "name": "draft_soap_note",
    "description": "Return the dental visit as a SOAP note draft.",
    "input_schema": {
        "type": "object",
        "properties": {
            "subjective": {"type": "string", "description": "Chief complaint and history in the patient's words, concise."},
            "objective": {"type": "string", "description": "Examination findings, tests and radiographs, with FDI tooth numbers."},
            "assessment": {"type": "string", "description": "Diagnosis or provisional diagnosis. Only what the dentist stated."},
            "plan": {"type": "string", "description": "Treatment done today, prescriptions, advice and next steps."},
            "teeth": {"type": "array", "items": {"type": "string"}, "description": "FDI tooth numbers mentioned."},
            "follow_up": {"type": "string", "description": "When to review, if said. Empty if not."},
            "needs_checking": {"type": "array", "items": {"type": "string"},
                               "description": "Anything unclear, contradictory or missing that the dentist should check."},
        },
        "required": ["subjective", "objective", "assessment", "plan", "teeth", "follow_up", "needs_checking"],
    },
}

EXPLAIN_TOOL = {
    "name": "explain_treatment_plan",
    "description": "Return a plain-language explanation of a dental treatment plan for the patient.",
    "input_schema": {
        "type": "object",
        "properties": {
            "summary": {"type": "string", "description": "2-3 short sentences: what is wrong and what the plan fixes."},
            "steps": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "The treatment in everyday words (keep the clinical name in brackets)."},
                        "why": {"type": "string", "description": "Why it is needed, in one or two sentences."},
                        "what_to_expect": {"type": "string", "description": "What happens on the day: time, numbness, visits."},
                    },
                    "required": ["name", "why", "what_to_expect"],
                },
            },
            "aftercare": {"type": "string", "description": "Practical tips after treatment."},
            "questions": {"type": "array", "items": {"type": "string"},
                          "description": "2-4 questions the patient might want to ask the dentist."},
        },
        "required": ["summary", "steps", "aftercare", "questions"],
    },
}

SOAP_SYSTEM = (
    "You are a careful dental scribe for a clinic in India. You turn a dentist's spoken notes from one visit "
    "into a SOAP note. Use only what was said: never invent findings, diagnoses, doses or tooth numbers. Use FDI "
    "tooth notation. Keep standard dental abbreviations (IOPA, RCT, TTP, BOP, OHI). Write in clear English even if "
    "the dictation mixes Hindi or Marathi. If something is unclear or missing (for example a drug without a dose), "
    "leave it out of the note and list it under needs_checking."
)

EXPLAIN_SYSTEM = (
    "You explain dental treatment plans to patients of a clinic in India, kindly and simply, at a reading age of "
    "about 12. Avoid jargon; when a clinical term is needed, explain it. Be honest and do not promise outcomes or "
    "say treatment is painless. Do not mention prices. Do not give medical advice beyond the plan. Write the whole "
    "answer in {language}."
)


def _strip_names(text: str, names: list[str]) -> str:
    for n in sorted({n.strip() for n in names if n and len(n.strip()) > 1}, key=len, reverse=True):
        text = re.sub(rf"\b{re.escape(n)}\b", "the patient", text, flags=re.IGNORECASE)
    text = re.sub(r"\+?\d[\d\s-]{8,}\d", "[number]", text)  # phone numbers
    return text


def age_band(dob: str | None) -> str | None:
    try:
        born = date.fromisoformat(dob or "")
    except ValueError:
        return None
    today = date.today()
    age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    if age < 18:
        return "under 18"
    return f"{(age // 10) * 10}s"


def _call_tool(system: str, user: str, tool: dict, max_tokens: int = 2000) -> dict:
    s = get_settings()
    if s.ai_provider == "mock":
        return _mock(tool["name"], user)
    if not s.ai_ready:
        raise AppError(503, "The AI assistant isn't switched on for this clinic", "AI_DISABLED")
    try:
        res = httpx.post(
            f"{s.anthropic_api_base.rstrip('/')}/messages",
            headers={"x-api-key": s.anthropic_api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={
                "model": s.ai_model, "max_tokens": max_tokens, "system": system,
                "messages": [{"role": "user", "content": user}],
                "tools": [tool], "tool_choice": {"type": "tool", "name": tool["name"]},
            },
            timeout=60,
        )
    except httpx.HTTPError as exc:
        log.warning("Claude API unreachable: %s", exc.__class__.__name__)
        raise AppError(502, "The AI service couldn't be reached. Try again in a moment.", "AI_UNAVAILABLE")
    if res.status_code >= 400:
        detail = ""
        try:
            detail = res.json().get("error", {}).get("message", "")
        except ValueError:
            pass
        log.warning("Claude API error %s: %s", res.status_code, detail)
        code = 429 if res.status_code == 429 else 502
        raise AppError(code, "The AI service is busy. Try again in a moment." if code == 429 else "The AI service returned an error.",
                       "AI_ERROR")
    for block in res.json().get("content", []):
        if block.get("type") == "tool_use" and block.get("name") == tool["name"]:
            return block.get("input") or {}
    raise AppError(502, "The AI service gave an unexpected answer. Try again.", "AI_BAD_RESPONSE")


def soap_draft(transcript: str, *, names: list[str], context: dict) -> dict:
    clean = _strip_names(transcript, names)
    facts = "\n".join(f"- {k}: {v}" for k, v in context.items() if v)
    user = f"Patient context (no identifiers):\n{facts or '- none'}\n\nDentist's dictation:\n\"\"\"\n{clean}\n\"\"\""
    out = _call_tool(SOAP_SYSTEM, user, SOAP_TOOL)
    teeth = [t for t in (str(x).strip() for x in out.get("teeth") or []) if re.fullmatch(r"[1-8][1-8]", t)]
    return {
        "subjective": str(out.get("subjective") or "").strip(),
        "objective": str(out.get("objective") or "").strip(),
        "assessment": str(out.get("assessment") or "").strip(),
        "plan": str(out.get("plan") or "").strip(),
        "teeth": list(dict.fromkeys(teeth)),
        "followUp": str(out.get("follow_up") or "").strip(),
        "needsChecking": [str(x) for x in out.get("needs_checking") or []][:10],
    }


def explain_plan(plan_name: str, items: list[dict], language: str, context: dict) -> dict:
    if language not in LANGUAGES:
        raise AppError(400, "Choose English, Hindi or Marathi", "INVALID_LANGUAGE")
    lines = "\n".join(f"- {i['name']}" + (f" (tooth {i['tooth']})" if i.get("tooth") else "") + f" [{i['status']}]" for i in items)
    facts = "\n".join(f"- {k}: {v}" for k, v in context.items() if v)
    user = (f"Treatment plan: {plan_name}\nSteps:\n{lines}\n\nPatient context (no identifiers):\n{facts or '- none'}\n\n"
            "Explain this plan to the patient.")
    out = _call_tool(EXPLAIN_SYSTEM.format(language=LANGUAGES[language]), user, EXPLAIN_TOOL)
    steps = [{"name": str(s.get("name") or ""), "why": str(s.get("why") or ""), "whatToExpect": str(s.get("what_to_expect") or "")}
             for s in out.get("steps") or [] if isinstance(s, dict)]
    return {"summary": str(out.get("summary") or "").strip(), "steps": steps,
            "aftercare": str(out.get("aftercare") or "").strip(),
            "questions": [str(q) for q in out.get("questions") or []][:6]}


def _mock(tool: str, user: str) -> dict:
    """Deterministic placeholder output for development and tests (AI_PROVIDER=mock)."""
    if tool == "draft_soap_note":
        teeth = re.findall(r"\b([1-8][1-8])\b", user.split('"""')[-2] if '"""' in user else user)
        return {
            "subjective": "[Demo draft] Patient reports pain as dictated.",
            "objective": "[Demo draft] Findings as dictated" + (f" on tooth {', '.join(teeth)}." if teeth else "."),
            "assessment": "[Demo draft] Provisional diagnosis as dictated.",
            "plan": "[Demo draft] Treatment and advice as dictated.",
            "teeth": teeth, "follow_up": "",
            "needs_checking": ["This is a demo draft (AI_PROVIDER=mock). Switch on the real assistant to get real notes."],
        }
    return {
        "summary": "[Demo] This plan treats the problems your dentist found and protects your teeth from further damage.",
        "steps": [{"name": line.strip("- ").split(" [")[0], "why": "[Demo] Your dentist will explain why this is needed.",
                   "what_to_expect": "[Demo] What happens on the day."}
                  for line in user.split("Steps:\n", 1)[-1].split("\n\n", 1)[0].splitlines() if line.strip()],
        "aftercare": "[Demo] Follow the advice your dentist gives after each visit.",
        "questions": ["How many visits will this take?", "What happens if I wait?"],
    }
