"""Patient documents: X-rays, photos, reports. Upload, list, view, tag, annotate, compare."""

import json
import re
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, File, Form, Query, Request, UploadFile
from fastapi.responses import Response
from pydantic import Field
from sqlalchemy import select

from app.api.patients import get_patient_for
from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, StaffUser
from app.core.errors import AppError, bad_request, forbidden, not_found
from app.models import ClinicalNote, PatientDocument, TreatmentPlan, User
from app.schemas import CamelModel
from app.services import audit
from app.services import documents as store

router = APIRouter(tags=["documents"])

TYPES = ("X-Ray", "Intraoral Photo", "Lab Report", "Consent Form", "Insurance Document", "Prescription", "Other")
XRAY_KINDS = ("IOPA", "Bitewing", "OPG", "CBCT", "Cephalometric", "Other")
PATIENT_UPLOAD_TYPES = ("Insurance Document", "Lab Report", "Other")
TOOTH = re.compile(r"^[1-8][1-8]$")  # FDI permanent and primary teeth


class Annotation(CamelModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:10])
    kind: str = Field(pattern="^(arrow|circle|line|text)$")
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    x2: float | None = Field(default=None, ge=0, le=1)
    y2: float | None = Field(default=None, ge=0, le=1)
    r: float | None = Field(default=None, ge=0, le=1)
    text: str | None = Field(default=None, max_length=200)
    color: str = Field(default="#ef4444", pattern=r"^#[0-9a-fA-F]{6}$")
    by: str | None = None
    at: datetime | None = None


class DocumentOut(CamelModel):
    id: str
    patient_id: str
    clinic_id: str | None
    type: str
    xray_kind: str | None
    title: str
    file_name: str
    content_type: str
    size_bytes: int
    width: int | None
    height: int | None
    teeth: list[str]
    tags: list[str]
    notes: str | None
    taken_at: date | None
    annotations: list[Annotation]
    shared_with_patient: bool
    treatment_plan_id: str | None
    clinical_note_id: str | None
    uploaded_by_name: str | None = None
    uploaded_by_patient: bool
    is_image: bool
    file_url: str
    thumbnail_url: str | None
    created_at: datetime


class DocumentUpdate(CamelModel):
    type: str | None = None
    xray_kind: str | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    teeth: list[str] | None = Field(default=None, max_length=32)
    tags: list[str] | None = Field(default=None, max_length=20)
    notes: str | None = Field(default=None, max_length=4000)
    taken_at: date | None = None
    shared_with_patient: bool | None = None
    annotations: list[Annotation] | None = Field(default=None, max_length=100)
    treatment_plan_id: str | None = None
    clinical_note_id: str | None = None


def _clean_teeth(teeth: list[str]) -> list[str]:
    out = []
    for t in teeth:
        t = str(t).strip()
        if not t:
            continue
        if not TOOTH.match(t):
            raise AppError(400, f"{t} isn't a tooth number (use FDI, e.g. 16 or 46)", "INVALID_TOOTH", {"teeth": t})
        if t not in out:
            out.append(t)
    return out


def _url(request: Request, doc: PatientDocument, variant: str) -> str:
    """Path relative to the API prefix, so it works behind any proxy (the app adds its API base)."""
    return f"/documents/{doc.id}/download?{store.signed_query(doc.id, variant)}"


def _out(db, request: Request, doc: PatientDocument, names: dict[str, str] | None = None) -> DocumentOut:
    uploader = None
    if doc.uploaded_by_id:
        if names is not None and doc.uploaded_by_id in names:
            uploader = names[doc.uploaded_by_id]
        else:
            u = db.get(User, doc.uploaded_by_id)
            uploader = f"{u.first_name} {u.last_name}".strip() if u else None
    is_image = doc.content_type.startswith("image/")
    return DocumentOut(
        id=doc.id, patient_id=doc.patient_id, clinic_id=doc.clinic_id, type=doc.type, xray_kind=doc.xray_kind,
        title=doc.title, file_name=doc.file_name, content_type=doc.content_type, size_bytes=doc.size_bytes,
        width=doc.width, height=doc.height, teeth=doc.teeth or [], tags=doc.tags or [], notes=doc.notes,
        taken_at=doc.taken_at, annotations=[Annotation(**a) for a in doc.annotations or []],
        shared_with_patient=doc.shared_with_patient, treatment_plan_id=doc.treatment_plan_id,
        clinical_note_id=doc.clinical_note_id, uploaded_by_name=uploader, uploaded_by_patient=doc.uploaded_by_patient,
        is_image=is_image, file_url=_url(request, doc, "file"),
        thumbnail_url=_url(request, doc, "thumb") if doc.thumbnail_key else (_url(request, doc, "file") if is_image else None),
        created_at=doc.created_at,
    )


def _get(db, user: User, doc_id: str) -> PatientDocument:
    doc = db.get(PatientDocument, doc_id)
    if not doc or doc.deleted_at:
        raise not_found("Document")
    get_patient_for(db, user, doc.patient_id)
    if user.role == "patient" and not doc.shared_with_patient:
        raise not_found("Document")
    return doc


def _check_links(db, patient_id: str, plan_id: str | None, note_id: str | None) -> None:
    if plan_id:
        plan = db.get(TreatmentPlan, plan_id)
        if not plan or plan.patient_id != patient_id:
            raise not_found("Treatment plan")
    if note_id:
        note = db.get(ClinicalNote, note_id)
        if not note or note.patient_id != patient_id:
            raise not_found("Clinical note")


@router.get("/patients/{patient_id}/documents", response_model=list[DocumentOut])
def list_documents(patient_id: str, request: Request, db: DbSession, user: CurrentUser,
                   type: str | None = None, tooth: str | None = None):
    get_patient_for(db, user, patient_id)
    query = select(PatientDocument).where(PatientDocument.patient_id == patient_id, PatientDocument.deleted_at.is_(None))
    if user.role == "patient":
        query = query.where(PatientDocument.shared_with_patient.is_(True))
    if type and type != "All":
        query = query.where(PatientDocument.type == type)
    docs = db.scalars(query.order_by(PatientDocument.created_at.desc())).all()
    if tooth:
        docs = [d for d in docs if tooth in (d.teeth or [])]
    ids = {d.uploaded_by_id for d in docs if d.uploaded_by_id}
    names = {u.id: f"{u.first_name} {u.last_name}".strip() for u in db.scalars(select(User).where(User.id.in_(ids)))} if ids else {}
    return [_out(db, request, d, names) for d in docs]


@router.post("/patients/{patient_id}/documents", response_model=DocumentOut, status_code=201)
async def upload_document(
    patient_id: str,
    request: Request,
    db: DbSession,
    user: CurrentUser,
    file: UploadFile = File(...),
    type: str = Form("Other"),
    title: str | None = Form(None),
    xray_kind: str | None = Form(None, alias="xrayKind"),
    teeth: str | None = Form(None),  # comma separated or JSON list
    tags: str | None = Form(None),
    notes: str | None = Form(None),
    taken_at: date | None = Form(None, alias="takenAt"),
    shared_with_patient: bool = Form(True, alias="sharedWithPatient"),
    treatment_plan_id: str | None = Form(None, alias="treatmentPlanId"),
    clinical_note_id: str | None = Form(None, alias="clinicalNoteId"),
):
    patient = get_patient_for(db, user, patient_id)
    if user.role == "patient" and type not in PATIENT_UPLOAD_TYPES:
        raise forbidden("Patients can upload insurance papers, outside reports and other documents")
    if type not in TYPES:
        raise bad_request("Unknown document type", "INVALID_TYPE")
    if xray_kind and xray_kind not in XRAY_KINDS:
        raise bad_request("Unknown X-ray type", "INVALID_XRAY_KIND")
    limit = get_settings().max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise AppError(413, f"Files can be up to {get_settings().max_upload_mb} MB", "FILE_TOO_LARGE")
    if not data:
        raise bad_request("The file is empty", "EMPTY_FILE")
    kind = store.detect(data)
    if not kind:
        raise AppError(415, "Upload a JPEG, PNG, WebP, PDF or DICOM file", "UNSUPPORTED_FILE")

    def parse_list(raw: str | None) -> list[str]:
        if not raw:
            return []
        try:
            value = json.loads(raw)
            return [str(v) for v in value] if isinstance(value, list) else [str(value)]
        except ValueError:
            return [p for p in re.split(r"[,\s]+", raw) if p]

    _check_links(db, patient.id, treatment_plan_id, clinical_note_id)
    key = store.save(data, patient.id, kind.extension)
    width = height = thumb = None
    if kind.is_image:
        width, height, thumb = store.image_info_and_thumbnail(data, patient.id)
    original = (file.filename or f"upload.{kind.extension}").replace("\\", "/").split("/")[-1][:255]
    doc = PatientDocument(
        patient_id=patient.id, clinic_id=patient.clinic_id, type=type, xray_kind=xray_kind if type == "X-Ray" else None,
        title=(title or original.rsplit(".", 1)[0] or type)[:200], file_name=original, content_type=kind.content_type,
        size_bytes=len(data), sha256=store.sha256(data), storage_key=key, thumbnail_key=thumb, width=width, height=height,
        teeth=_clean_teeth(parse_list(teeth)), tags=[t[:40] for t in parse_list(tags)][:20], notes=(notes or "").strip() or None,
        taken_at=taken_at or datetime.now(timezone.utc).date(),
        shared_with_patient=True if user.role == "patient" else shared_with_patient,
        treatment_plan_id=treatment_plan_id, clinical_note_id=clinical_note_id, uploaded_by_id=user.id,
        uploaded_by_patient=user.role == "patient",
    )
    db.add(doc)
    db.flush()
    audit.record(db, user, "upload", "document", doc.id, after={"type": doc.type, "file": doc.file_name, "size": doc.size_bytes})
    db.commit()
    return _out(db, request, doc)


@router.get("/documents/{document_id}", response_model=DocumentOut)
def get_document(document_id: str, request: Request, db: DbSession, user: CurrentUser):
    return _out(db, request, _get(db, user, document_id))


@router.patch("/documents/{document_id}", response_model=DocumentOut)
def update_document(document_id: str, body: DocumentUpdate, request: Request, db: DbSession, user: StaffUser):
    doc = _get(db, user, document_id)
    data = body.model_dump(exclude_unset=True)
    if "type" in data and data["type"] not in TYPES:
        raise bad_request("Unknown document type", "INVALID_TYPE")
    if data.get("xray_kind") and data["xray_kind"] not in XRAY_KINDS:
        raise bad_request("Unknown X-ray type", "INVALID_XRAY_KIND")
    _check_links(db, doc.patient_id, data.get("treatment_plan_id"), data.get("clinical_note_id"))
    if "teeth" in data:
        data["teeth"] = _clean_teeth(data["teeth"] or [])
    if "annotations" in data:
        now = datetime.now(timezone.utc)
        data["annotations"] = [
            {**a.model_dump(mode="json", exclude_none=True), "by": a.by or f"{user.first_name} {user.last_name}".strip(),
             "at": (a.at or now).isoformat()} for a in body.annotations or []]
    if "tags" in data:
        data["tags"] = [str(t)[:40] for t in data["tags"] or []]
    for k, v in data.items():
        if k in ("title",) and v is None:
            continue
        setattr(doc, k, v)
    audit.record(db, user, "update", "document", doc.id, after={k: (v if k != "annotations" else len(v or [])) for k, v in data.items()})
    db.commit()
    return _out(db, request, doc)


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(document_id: str, db: DbSession, user: CurrentUser):
    """Moves the document out of the record. The file is kept for the audit trail."""
    doc = _get(db, user, document_id)
    if user.role == "patient" and not (doc.uploaded_by_patient and doc.uploaded_by_id == user.id):
        raise forbidden("You can only remove documents you uploaded")
    if user.role == "receptionist" and doc.type in ("X-Ray", "Intraoral Photo", "Consent Form"):
        raise forbidden("Ask a dentist or admin to remove clinical images and consent forms")
    doc.deleted_at = datetime.now(timezone.utc)
    doc.deleted_by_id = user.id
    audit.record(db, user, "delete", "document", doc.id, after={"file": doc.file_name})
    db.commit()
    return Response(status_code=204)


@router.get("/documents/{document_id}/download", name="download_document")
def download_document(document_id: str, db: DbSession, v: str = "file", e: int = 0, s: str = "",
                      download: bool = Query(False)):
    """Served with a short-lived signed link (see the document's fileUrl), so it works in <img> tags."""
    if v not in ("file", "thumb") or not store.check_signature(document_id, v, e, s):
        raise AppError(403, "This link has expired. Reload the page.", "LINK_EXPIRED")
    doc = db.get(PatientDocument, document_id)
    if not doc or doc.deleted_at:
        raise not_found("Document")
    key = doc.thumbnail_key if v == "thumb" and doc.thumbnail_key else doc.storage_key
    if not store.exists(key):
        raise not_found("File")
    media = "image/jpeg" if v == "thumb" and doc.thumbnail_key else doc.content_type
    safe_name = re.sub(r'[^\w.\- ]', "_", doc.file_name)[:150] or "document"
    disposition = "attachment" if download or media == "application/dicom" else "inline"
    headers = {
        "Content-Disposition": f'{disposition}; filename="{safe_name}"',
        "Cache-Control": "private, max-age=600",
        "X-Content-Type-Options": "nosniff",
    }
    if media.startswith("image/"):
        headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"
    return Response(content=store.read(key), media_type=media, headers=headers)
