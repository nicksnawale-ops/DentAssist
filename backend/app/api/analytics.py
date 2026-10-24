"""Owner analytics."""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from app.core.deps import DbSession, accessible_clinic_ids, ensure_clinic_access, require_roles
from app.core.errors import bad_request
from app.models import User
from app.services import analytics as svc

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview")
def overview(
    db: DbSession,
    user: User = Depends(require_roles("super_admin", "admin", "dentist")),
    start: date | None = Query(default=None, alias="from"),
    end: date | None = Query(default=None, alias="to"),
    clinic_id: str | None = Query(default=None, alias="clinicId"),
    dentist_id: str | None = Query(default=None, alias="dentistId"),
):
    """Everything on the analytics page for one period, plus the headline numbers for the period before."""
    today = datetime.now(timezone.utc).date()
    end = end or today
    start = start or (end - timedelta(days=89))
    if start > end:
        raise bad_request("The start date is after the end date", "INVALID_RANGE")
    if (end - start).days > 731:
        raise bad_request("Choose a period of up to two years", "RANGE_TOO_LONG")
    end_excl = end + timedelta(days=1)

    scope = accessible_clinic_ids(user)
    if clinic_id and clinic_id != "all":
        ensure_clinic_access(user, clinic_id)
        scope = {clinic_id}
    if user.role == "dentist":
        dentist_id = user.id  # dentists only see their own numbers

    current = svc.compute(db, scope, start, end_excl, dentist_id)
    length = end_excl - start
    previous = svc.compute(db, scope, start - length, start, dentist_id)
    current["previous"] = previous["kpis"]
    current["previousRange"] = previous["range"]
    return current
