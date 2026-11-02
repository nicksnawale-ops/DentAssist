from collections.abc import Callable
from typing import Annotated

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import AppError, forbidden
from app.core.security import decode_token
from app.models import User

bearer_scheme = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]

STAFF_ROLES = ("super_admin", "admin", "dentist", "receptionist")


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AppError(401, "Not authenticated", "UNAUTHORIZED")
    try:
        payload = decode_token(credentials.credentials, "access")
    except jwt.ExpiredSignatureError:
        raise AppError(401, "Session expired", "TOKEN_EXPIRED")
    except jwt.PyJWTError:
        raise AppError(401, "Invalid token", "UNAUTHORIZED")

    user = db.get(User, payload.get("sub"))
    if user is None or not user.is_active or payload.get("ver") != user.token_version:
        raise AppError(401, "Invalid token", "UNAUTHORIZED")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: str) -> Callable[..., User]:
    """Dependency factory: `user: User = Depends(require_roles("super_admin", "admin"))`."""

    def _checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise forbidden()
        return user

    return _checker


StaffUser = Annotated[User, Depends(require_roles(*STAFF_ROLES))]


def accessible_clinic_ids(user: User) -> set[str] | None:
    """Clinics a user may see. None means unrestricted (super admin)."""
    if user.role == "super_admin":
        return None
    ids: set[str] = set()
    if user.clinic_id:
        ids.add(user.clinic_id)
    if user.staff_profile and user.staff_profile.clinic_ids:
        ids.update(user.staff_profile.clinic_ids)
    return ids


def ensure_clinic_access(user: User, clinic_id: str | None) -> None:
    allowed = accessible_clinic_ids(user)
    if allowed is None:
        return
    if clinic_id is None or clinic_id not in allowed:
        raise forbidden("You do not have access to this clinic")
