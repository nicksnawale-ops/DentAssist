import jwt
from fastapi import APIRouter
from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession
from app.core.errors import AppError
from app.core.security import create_token, decode_token, hash_password, verify_password
from app.models import User
from app.schemas import ChangePasswordRequest, LoginRequest, RefreshRequest, TokenResponse, UserOut
from app.services import audit
from app.services.serializers import user_out

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_tokens(user: User) -> TokenResponse:
    claims = {"role": user.role, "ver": user.token_version}
    return TokenResponse(
        access_token=create_token(user.id, "access", claims),
        refresh_token=create_token(user.id, "refresh", claims),
        expires_in=get_settings().access_token_expire_minutes * 60,
        user=user_out(user),
    )


def _can_sign_in(user: User | None) -> bool:
    if user is None or not user.is_active:
        return False
    if user.staff_profile and user.staff_profile.status == "inactive":
        return False
    return True


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: DbSession):
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    # Same message for unknown email and wrong password, so accounts can't be enumerated.
    if not user or not verify_password(body.password, user.password_hash) or not _can_sign_in(user):
        raise AppError(401, "Invalid email or password", "INVALID_CREDENTIALS")
    return _issue_tokens(user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, db: DbSession):
    try:
        payload = decode_token(body.refresh_token, "refresh")
    except jwt.PyJWTError:
        raise AppError(401, "Session expired, please sign in again", "INVALID_REFRESH_TOKEN")
    user = db.get(User, payload.get("sub"))
    if not _can_sign_in(user) or payload.get("ver") != user.token_version:
        raise AppError(401, "Session expired, please sign in again", "INVALID_REFRESH_TOKEN")
    return _issue_tokens(user)


@router.post("/logout", status_code=204)
def logout(user: CurrentUser, db: DbSession):
    # Invalidates every outstanding access/refresh token for this user.
    user.token_version += 1
    db.commit()


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user_out(user)


@router.post("/change-password", status_code=204)
def change_password(body: ChangePasswordRequest, user: CurrentUser, db: DbSession):
    if not verify_password(body.current_password, user.password_hash):
        raise AppError(400, "Current password is incorrect", "INVALID_PASSWORD",
                       {"currentPassword": "Current password is incorrect"})
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1
    audit.record(db, user, "password_changed", "user", user.id)
    db.commit()
