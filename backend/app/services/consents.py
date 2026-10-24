"""Consent forms: rendering templates, signing links and tamper evidence."""

import base64
import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Clinic, ConsentForm, ConsentTemplate, Patient, User
from app.services.scheduling import as_utc

LINK_LIFETIME = timedelta(hours=72)
MAX_SIGNATURE_BYTES = 300_000
_PLACEHOLDER = re.compile(r"\{(patient_name|procedure|teeth|dentist|clinic|date)\}")


def render(template_body: str, *, patient: Patient, clinic: Clinic, dentist: User | None, procedure: str,
           teeth: list[str], when: datetime) -> str:
    values = {
        "patient_name": f"{patient.first_name} {patient.last_name}".strip(),
        "procedure": procedure or "the proposed treatment",
        "teeth": ", ".join(teeth) if teeth else "as discussed",
        "dentist": f"Dr. {dentist.first_name} {dentist.last_name}".strip() if dentist else "my dentist",
        "clinic": clinic.name,
        "date": when.strftime("%d %b %Y"),
    }
    return _PLACEHOLDER.sub(lambda m: values[m.group(1)], template_body)


def new_sign_token(form: ConsentForm) -> str:
    token = secrets.token_urlsafe(32)
    form.sign_token_hash = hashlib.sha256(token.encode()).hexdigest()
    form.sign_token_expires_at = datetime.now(timezone.utc) + LINK_LIFETIME
    return token


def find_by_token(db: Session, token: str) -> ConsentForm | None:
    if not token or len(token) > 100:
        return None
    digest = hashlib.sha256(token.encode()).hexdigest()
    return db.scalars(select(ConsentForm).where(ConsentForm.sign_token_hash == digest)).first()


def validate_signature(data_url: str) -> str:
    """Accept only a PNG data URL of a sensible size. Returns it unchanged."""
    prefix = "data:image/png;base64,"
    if not data_url.startswith(prefix):
        raise ValueError("Signature must be a PNG image")
    raw = base64.b64decode(data_url[len(prefix):], validate=True)
    if not raw.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("Signature must be a PNG image")
    if len(raw) > MAX_SIGNATURE_BYTES:
        raise ValueError("Signature image is too large")
    if len(raw) < 200:
        raise ValueError("Please sign in the box")
    return data_url


def content_hash(form: ConsentForm) -> str:
    parts = [form.id, form.title, form.body, "\n".join(form.risks or []), form.signature or "",
             form.signed_by_name or "", form.signer_relationship or "",
             as_utc(form.signed_at).isoformat() if form.signed_at else ""]
    return hashlib.sha256("\x1f".join(parts).encode()).hexdigest()


def sign(form: ConsentForm, *, signature: str, signed_by_name: str, relationship: str, via: str,
         witness: User | None = None, ip: str | None = None, user_agent: str | None = None) -> None:
    form.signature = validate_signature(signature)
    form.signed_by_name = signed_by_name.strip()
    form.signer_relationship = relationship
    form.signed_at = datetime.now(timezone.utc).replace(microsecond=0)
    form.signed_via = via
    form.witness_id = witness.id if witness else None
    form.signer_ip = (ip or "")[:64] or None
    form.signer_user_agent = (user_agent or "")[:300] or None
    form.status = "signed"
    form.sign_token_hash = None  # the link stops working once used
    form.sign_token_expires_at = None
    form.content_hash = content_hash(form)


def verify(form: ConsentForm) -> bool:
    return form.status != "pending" and bool(form.content_hash) and form.content_hash == content_hash(form)


DEFAULT_TEMPLATES = [
    ("General dental treatment",
     "I, {patient_name}, agree to examination, X-rays, cleaning and routine dental treatment at {clinic} "
     "by {dentist} and the clinic team. The treatment, other options and the costs have been explained to me "
     "and I have been able to ask questions. I understand I can change my mind at any time before treatment.",
     ["Sensitivity or discomfort after treatment", "Bleeding or soreness of the gums",
      "Reaction to local anaesthetic (rare)"]),
    ("Tooth extraction",
     "I, {patient_name}, agree to the removal of tooth/teeth {teeth} ({procedure}) by {dentist} at {clinic}. "
     "The reason for the extraction, other options (including keeping the tooth) and what to expect afterwards "
     "have been explained to me. I will follow the after-care instructions I have been given.",
     ["Pain, swelling and bruising for a few days", "Bleeding after the procedure", "Dry socket (delayed healing)",
      "Infection needing further treatment", "Numbness of the lip, chin or tongue, usually temporary",
      "Damage to nearby teeth or fillings", "A piece of root may be left if removing it is riskier"]),
    ("Root canal treatment",
     "I, {patient_name}, agree to root canal treatment of tooth/teeth {teeth} by {dentist} at {clinic}. "
     "I understand this removes the nerve, cleans and seals the root canals, that it may take more than one visit, "
     "and that a crown is usually advised afterwards to protect the tooth.",
     ["Discomfort for a few days after each visit", "An instrument may break inside the canal",
      "The tooth may still need extraction if treatment fails", "The tooth can crack without a crown",
      "Flare-up of infection between visits"]),
    ("Dental implant",
     "I, {patient_name}, agree to dental implant surgery ({procedure}) at site {teeth} by {dentist} at {clinic}. "
     "The stages of treatment, healing time, other options such as a bridge or denture, and the costs have been "
     "explained to me. I understand smoking and some health conditions reduce the success of implants.",
     ["Swelling, bruising and pain after surgery", "The implant may not fuse with the bone and may need removing",
      "Numbness of the lip or chin from nerve injury, rarely permanent", "Sinus involvement for upper implants",
      "Infection around the implant"]),
    ("Teeth whitening",
     "I, {patient_name}, agree to teeth whitening ({procedure}) at {clinic}. I understand results vary, that "
     "crowns and fillings don't change colour, and that the effect fades over time.",
     ["Temporary tooth sensitivity", "Gum irritation", "Uneven results on some teeth"]),
]


def seed_templates(db: Session) -> None:
    if db.scalar(select(func.count()).select_from(ConsentTemplate)):
        return
    for name, body, risks in DEFAULT_TEMPLATES:
        db.add(ConsentTemplate(name=name, body=body, risks=risks))
