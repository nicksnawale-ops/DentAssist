"""Free-slot finder.

A dentist is bookable when the clinic is open AND the dentist is working
(their weekly hours; if none are set, the clinic's hours), and they have no
active appointment at any clinic at that time. All maths happens in the
clinic's local time zone; results are returned as UTC datetimes.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Appointment, Clinic, User
from app.services.scheduling import ACTIVE_STATUSES, as_utc

STEP_MINUTES = 15
DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


@dataclass
class Slot:
    dentist_id: str
    dentist_name: str
    start: datetime  # UTC
    end: datetime  # UTC


def clinic_tz(clinic: Clinic) -> ZoneInfo:
    try:
        return ZoneInfo(clinic.timezone or "Asia/Kolkata")
    except Exception:
        return ZoneInfo("Asia/Kolkata")


def _parse(hhmm: str) -> time | None:
    try:
        h, m = hhmm.split(":")[:2]
        return time(int(h), int(m))
    except (ValueError, AttributeError):
        return None


def _clinic_window(clinic: Clinic, day: date) -> tuple[time, time] | None:
    name = DAY_NAMES[day.weekday()]
    for row in clinic.operating_hours or []:
        if row.get("day") == name:
            if not row.get("isOpen"):
                return None
            start, end = _parse(row.get("openTime", "")), _parse(row.get("closeTime", ""))
            return (start, end) if start and end and start < end else None
    return None if not clinic.operating_hours else None


def _dentist_window(dentist: User, day: date) -> tuple[time, time] | None | bool:
    """Returns a window, None when not working, or True when no hours are set (use the clinic's)."""
    hours = dentist.staff_profile.working_hours if dentist.staff_profile else None
    if not hours:
        return True
    name = DAY_NAMES[day.weekday()]
    for row in hours:
        if row.get("day") == name:
            if not row.get("isWorking"):
                return None
            start, end = _parse(row.get("startTime", "")), _parse(row.get("endTime", ""))
            return (start, end) if start and end and start < end else None
    return None


def dentists_at(db: Session, clinic: Clinic, dentist_id: str | None = None) -> list[User]:
    query = select(User).where(User.role.in_(["dentist", "admin"]), User.is_active.is_(True))
    if dentist_id:
        query = query.where(User.id == dentist_id)
    out = []
    for u in db.scalars(query).unique():
        clinics = set(u.staff_profile.clinic_ids or []) if u.staff_profile else set()
        if u.clinic_id:
            clinics.add(u.clinic_id)
        if clinic.id not in clinics:
            continue
        if u.staff_profile and u.staff_profile.status != "active":
            continue
        if u.role == "admin" and not (u.staff_profile and u.staff_profile.license_number):
            continue  # admins only count as bookable if they're licensed clinicians
        out.append(u)
    return sorted(out, key=lambda u: (u.first_name, u.last_name))


def free_slots(
    db: Session,
    clinic: Clinic,
    day: date,
    duration_minutes: int,
    dentist_id: str | None = None,
    not_before: datetime | None = None,
) -> list[Slot]:
    tz = clinic_tz(clinic)
    window = _clinic_window(clinic, day)
    if window is None or duration_minutes <= 0:
        return []
    dentists = dentists_at(db, clinic, dentist_id)
    if not dentists:
        return []

    day_start = datetime.combine(day, time.min, tzinfo=tz).astimezone(timezone.utc)
    day_end = day_start + timedelta(days=1)
    busy_rows = db.execute(
        select(Appointment.dentist_id, Appointment.start_time, Appointment.end_time).where(
            Appointment.dentist_id.in_([d.id for d in dentists]),
            Appointment.status.in_(ACTIVE_STATUSES),
            Appointment.start_time < day_end,
            Appointment.end_time > day_start,
        )
    ).all()
    busy: dict[str, list[tuple[datetime, datetime]]] = {}
    for did, s, e in busy_rows:
        busy.setdefault(did, []).append((as_utc(s), as_utc(e)))

    floor = as_utc(not_before) if not_before else None
    length = timedelta(minutes=duration_minutes)
    step = timedelta(minutes=STEP_MINUTES)
    slots: list[Slot] = []
    for d in dentists:
        dw = _dentist_window(d, day)
        if dw is None:
            continue
        start_t, end_t = window if dw is True else (max(window[0], dw[0]), min(window[1], dw[1]))
        if start_t >= end_t:
            continue
        cursor = datetime.combine(day, start_t, tzinfo=tz).astimezone(timezone.utc)
        close = datetime.combine(day, end_t, tzinfo=tz).astimezone(timezone.utc)
        name = f"Dr. {d.first_name} {d.last_name}".strip()
        while cursor + length <= close:
            end = cursor + length
            if (floor is None or cursor >= floor) and not any(s < end and e > cursor for s, e in busy.get(d.id, [])):
                slots.append(Slot(d.id, name, cursor, end))
            cursor += step
    return sorted(slots, key=lambda s: (s.start, s.dentist_name))


def next_free_slots(
    db: Session,
    clinic: Clinic,
    duration_minutes: int,
    dentist_id: str | None = None,
    not_before: datetime | None = None,
    limit: int = 6,
    days_ahead: int = 21,
) -> list[Slot]:
    """The earliest free slots, spread over days (at most 3 per day so the list shows choice)."""
    tz = clinic_tz(clinic)
    start = (as_utc(not_before) if not_before else datetime.now(timezone.utc)).astimezone(tz).date()
    found: list[Slot] = []
    for offset in range(days_ahead):
        day_slots = free_slots(db, clinic, start + timedelta(days=offset), duration_minutes, dentist_id, not_before)
        picked: list[Slot] = []
        for s in day_slots:
            # Skip slots within 45 minutes of one already picked, to offer genuinely different times.
            if all(abs((s.start - p.start).total_seconds()) >= 45 * 60 for p in picked):
                picked.append(s)
            if len(picked) == 3:
                break
        found.extend(picked)
        if len(found) >= limit:
            break
    return found[:limit]


def is_free(db: Session, clinic: Clinic, dentist_id: str, start: datetime, end: datetime) -> bool:
    """Exact check used before confirming a booking made from a slot list."""
    start, end = as_utc(start), as_utc(end)
    tz = clinic_tz(clinic)
    duration = int((end - start).total_seconds() // 60)
    for slot in free_slots(db, clinic, start.astimezone(tz).date(), duration, dentist_id):
        if slot.start == start and slot.end == end:
            return True
    return False
