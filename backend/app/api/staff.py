import secrets

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import DbSession, StaffUser, accessible_clinic_ids, ensure_clinic_access, require_roles
from app.core.errors import conflict, forbidden, not_found
from app.core.security import hash_password
from app.models import StaffProfile, User, utcnow
from app.schemas import PasswordResetOut, StaffCreate, StaffCreated, StaffUpdate, UserOut, column_values
from app.services import audit
from app.services.serializers import user_out

router = APIRouter(prefix="/staff", tags=["staff"])

STAFF_MEMBER_ROLES = ("admin", "dentist", "receptionist")
Manager = Depends(require_roles("super_admin", "admin"))
SuperAdmin = Depends(require_roles("super_admin"))

_PROFILE_FIELDS = ("clinic_ids", "status", "specializations", "license_number", "working_hours", "date_joined")
_USER_FIELDS = ("email", "first_name", "last_name", "role", "clinic_id", "phone", "avatar_url")


def _staff_clinics(member: User) -> set[str]:
    ids = set(member.staff_profile.clinic_ids or []) if member.staff_profile else set()
    if member.clinic_id:
        ids.add(member.clinic_id)
    return ids


def _visible(actor: User, member: User) -> bool:
    allowed = accessible_clinic_ids(actor)
    return allowed is None or bool(allowed & _staff_clinics(member))


def _get(db: Session, actor: User, staff_id: str) -> User:
    member = db.get(User, staff_id)
    if not member or member.role not in STAFF_MEMBER_ROLES or not _visible(actor, member):
        raise not_found("Staff member")
    return member


def _email_taken(db: Session, email: str, exclude_id: str | None = None) -> bool:
    query = select(User.id).where(func.lower(User.email) == email.lower())
    if exclude_id:
        query = query.where(User.id != exclude_id)
    return db.scalar(query) is not None


def _check_assignment(actor: User, role: str | None, clinic_ids: set[str]) -> None:
    """Clinic admins can only manage dentists/receptionists inside their own clinics."""
    if actor.role == "super_admin":
        return
    if role == "admin":
        raise forbidden("Only a super admin can create or promote admins")
    for cid in clinic_ids:
        ensure_clinic_access(actor, cid)


@router.get("", response_model=list[UserOut])
def list_staff(user: StaffUser, db: DbSession, role: str | None = None, clinic_id: str | None = None):
    query = select(User).where(User.role.in_(STAFF_MEMBER_ROLES)).order_by(User.first_name, User.last_name)
    if role:
        query = query.where(User.role == role)
    members = [m for m in db.scalars(query).unique() if _visible(user, m)]
    if clinic_id and clinic_id != "all":
        members = [m for m in members if clinic_id in _staff_clinics(m)]
    return [user_out(m) for m in members]


@router.post("", response_model=StaffCreated, status_code=201)
def create_staff(body: StaffCreate, db: DbSession, actor: User = Manager):
    clinic_ids = set(body.clinic_ids or []) | ({body.clinic_id} if body.clinic_id else set())
    if not clinic_ids:
        raise conflict("Assign the staff member to at least one clinic", "CLINIC_REQUIRED")
    _check_assignment(actor, body.role, clinic_ids)
    if _email_taken(db, body.email):
        raise conflict("A user with this email already exists", "EMAIL_EXISTS")

    temp_password = None if body.password else secrets.token_urlsafe(9)
    member = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password or temp_password),
        first_name=body.first_name,
        last_name=body.last_name,
        role=body.role,
        clinic_id=body.clinic_id or sorted(clinic_ids)[0],
        phone=body.phone,
        avatar_url=body.avatar_url,
    )
    member.staff_profile = StaffProfile(
        clinic_ids=sorted(clinic_ids),
        status=body.status or "active",
        specializations=body.specializations or [],
        license_number=body.license_number,
        working_hours=[w.model_dump(by_alias=True) for w in body.working_hours] if body.working_hours else None,
        date_joined=body.date_joined or utcnow(),
    )
    db.add(member)
    db.flush()
    audit.record(db, actor, "create", "staff", member.id, after=body)
    db.commit()
    db.refresh(member)
    return StaffCreated(**user_out(member).model_dump(), temporary_password=temp_password)


@router.get("/{staff_id}", response_model=UserOut)
def get_staff(staff_id: str, user: StaffUser, db: DbSession):
    return user_out(_get(db, user, staff_id))


@router.patch("/{staff_id}", response_model=UserOut)
def update_staff(staff_id: str, body: StaffUpdate, db: DbSession, actor: User = Manager):
    member = _get(db, actor, staff_id)
    data = column_values(body)
    new_clinics = set(data.get("clinic_ids") or []) | ({data["clinic_id"]} if data.get("clinic_id") else set())
    _check_assignment(actor, data.get("role"), new_clinics)
    if actor.role != "super_admin" and member.role == "admin":
        raise forbidden("Only a super admin can edit admins")
    if "email" in data and _email_taken(db, data["email"], exclude_id=member.id):
        raise conflict("A user with this email already exists", "EMAIL_EXISTS")

    before = user_out(member)
    for key in _USER_FIELDS:
        if key in data and data[key] is not None:
            setattr(member, key, data[key].lower() if key == "email" else data[key])
    if member.staff_profile is None:
        member.staff_profile = StaffProfile(clinic_ids=[], specializations=[])
    for key in _PROFILE_FIELDS:
        if key in data:
            setattr(member.staff_profile, key, data[key])
    if data.get("status") == "inactive":
        member.token_version += 1  # sign them out everywhere
    audit.record(db, actor, "update", "staff", member.id, before=before, after=user_out(member))
    db.commit()
    db.refresh(member)
    return user_out(member)


@router.delete("/{staff_id}", response_model=UserOut)
def deactivate_staff(staff_id: str, db: DbSession, actor: User = SuperAdmin):
    """Soft delete: the account is disabled but history (appointments, notes) is kept."""
    member = _get(db, actor, staff_id)
    member.is_active = False
    member.token_version += 1
    if member.staff_profile:
        member.staff_profile.status = "inactive"
    audit.record(db, actor, "deactivate", "staff", member.id)
    db.commit()
    return user_out(member)


@router.post("/{staff_id}/reset-password", response_model=PasswordResetOut)
def reset_password(staff_id: str, db: DbSession, actor: User = SuperAdmin):
    member = _get(db, actor, staff_id)
    temp = secrets.token_urlsafe(9)
    member.password_hash = hash_password(temp)
    member.token_version += 1
    audit.record(db, actor, "reset_password", "staff", member.id)
    db.commit()
    return PasswordResetOut(temporary_password=temp)
