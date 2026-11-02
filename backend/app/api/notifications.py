from fastapi import APIRouter
from sqlalchemy import select, update

from app.core.deps import CurrentUser, DbSession
from app.core.errors import not_found
from app.models import Notification
from app.schemas import NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(user: CurrentUser, db: DbSession, limit: int = 50):
    query = (
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(min(max(limit, 1), 200))
    )
    return db.scalars(query).all()


@router.patch("/{notification_id}/read", response_model=NotificationOut)
def mark_read(notification_id: str, user: CurrentUser, db: DbSession):
    note = db.get(Notification, notification_id)
    if not note or note.user_id != user.id:
        raise not_found("Notification")
    note.is_read = True
    db.commit()
    return note


@router.post("/read-all", status_code=204)
def mark_all_read(user: CurrentUser, db: DbSession):
    db.execute(update(Notification).where(Notification.user_id == user.id).values(is_read=True))
    db.commit()
