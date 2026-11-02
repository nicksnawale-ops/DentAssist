from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.core.deps import DbSession, StaffUser, require_roles
from app.core.errors import not_found
from app.models import AppSetting, AuditLog, User
from app.schemas import AuditLogOut
from app.services import audit

router = APIRouter(tags=["settings"])

SuperAdmin = Depends(require_roles("super_admin"))


def _setting(db, key: str) -> AppSetting:
    row = db.get(AppSetting, key)
    if row is None:
        raise not_found("Setting")
    return row


@router.get("/permissions")
def get_permissions(user: StaffUser, db: DbSession) -> list[dict[str, Any]]:
    """RBAC matrix shown on the Roles & Permissions screen.

    Note: route-level access is enforced in code (require_roles); this matrix is
    the editable reference that the UI displays.
    """
    return _setting(db, "permissions").value


@router.put("/permissions")
def update_permissions(body: list[dict[str, Any]], db: DbSession, user: User = SuperAdmin) -> list[dict[str, Any]]:
    row = _setting(db, "permissions")
    audit.record(db, user, "update", "permissions", "permissions", before={"value": row.value}, after={"value": body})
    row.value = body
    db.commit()
    return row.value


@router.get("/platform/subscription")
def get_subscription(db: DbSession, user: User = SuperAdmin) -> dict[str, Any]:
    return _setting(db, "subscription").value


@router.get("/audit-logs", response_model=list[AuditLogOut])
def list_audit_logs(db: DbSession, user: User = SuperAdmin, entity_type: str | None = None, limit: int = 100):
    query = select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(min(max(limit, 1), 500))
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    return db.scalars(query).all()
