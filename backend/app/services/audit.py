from typing import Any

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models import AuditLog, User

# Never copy these into the audit trail.
_REDACT = {"password", "password_hash", "passwordHash", "temporaryPassword"}


def snapshot(obj: Any) -> dict | None:
    if obj is None:
        return None
    if isinstance(obj, BaseModel):
        data = obj.model_dump(mode="json", by_alias=True)
    elif isinstance(obj, dict):
        data = obj
    else:
        data = {c.key: getattr(obj, c.key) for c in obj.__mapper__.column_attrs}
    clean = {}
    for k, v in data.items():
        if k in _REDACT:
            continue
        clean[k] = v if isinstance(v, (str, int, float, bool, list, dict, type(None))) else str(v)
    return clean


def record(
    db: Session,
    actor: User | None,
    action: str,
    entity_type: str,
    entity_id: str,
    before: Any = None,
    after: Any = None,
) -> None:
    """Add an audit row to the current transaction (committed with the caller's change)."""
    db.add(
        AuditLog(
            actor_user_id=actor.id if actor else None,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            before_state=snapshot(before),
            after_state=snapshot(after),
        )
    )
