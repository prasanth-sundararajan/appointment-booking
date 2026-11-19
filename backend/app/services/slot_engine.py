"""Slot engine (PRP Module 4).

`compute_slots` is a pure function (no DB, no clock) so it is easy to test.
`get_open_slots` loads everything it needs from the DB and calls it.

Algorithm:
1. Working intervals for the day come from WorkingHours in the business timezone and
   are converted to UTC with zoneinfo (DST-safe).
2. Subtract time off, active bookings (confirmed + pending_payment with an unexpired hold)
   padded by the buffer, and Google busy blocks.
3. Step in 15-minute increments from each working-interval start; keep starts where
   [start, start + duration) fits in the free time.
4. Drop starts before now + min_notice and after now + max_advance.
5. Merge across staff and record which staff are free for each start.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from typing import TypedDict
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, and_, or_, select
from sqlalchemy.orm import Session

from app.models import (
    Booking,
    BookingStatus,
    Business,
    CalendarBusyBlock,
    CalendarConnection,
    Service,
    StaffMember,
    StaffService,
    TimeOff,
    WorkingHours,
)

STEP_MINUTES = 15

Interval = tuple[datetime, datetime]


class Slot(TypedDict):
    start_at: datetime
    end_at: datetime
    staff_ids: list[int]


@dataclass(frozen=True)
class WorkingWindow:
    weekday: int  # 0 = Monday
    start_time: time
    end_time: time


@dataclass
class StaffSchedule:
    """Everything the pure engine needs about one staff member."""

    staff_id: int
    working_hours: list[WorkingWindow]
    time_off: list[Interval] = field(default_factory=list)
    bookings: list[Interval] = field(default_factory=list)  # active, NOT yet padded
    busy_blocks: list[Interval] = field(default_factory=list)


# --------------------------------------------------------------------------- helpers


def _utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        raise ValueError("naive datetime passed to slot engine; use timezone-aware values")
    return dt.astimezone(UTC)


def local_to_utc(day: date, t: time, tz: ZoneInfo) -> datetime:
    """Wall-clock time in `tz` to UTC. Non-existent (spring-forward) times resolve with
    fold=0, i.e. they are shifted forward by the DST gap; ambiguous times use the first
    occurrence."""
    return datetime.combine(day, t, tzinfo=tz).astimezone(UTC)


def day_bounds_utc(day: date, tz: ZoneInfo) -> Interval:
    """UTC instants of local midnight of `day` and of the next day (23/24/25h long)."""
    return local_to_utc(day, time(0), tz), local_to_utc(day + timedelta(days=1), time(0), tz)


def _merge(intervals: Iterable[Interval]) -> list[Interval]:
    ordered = sorted((s, e) for s, e in intervals if e > s)
    merged: list[Interval] = []
    for s, e in ordered:
        if merged and s <= merged[-1][1]:
            if e > merged[-1][1]:
                merged[-1] = (merged[-1][0], e)
        else:
            merged.append((s, e))
    return merged


def _subtract(free: list[Interval], blocked: list[Interval]) -> list[Interval]:
    """free - blocked; both lists merged and sorted."""
    result: list[Interval] = []
    for fs, fe in free:
        cursor = fs
        for bs, be in blocked:
            if be <= cursor or bs >= fe:
                continue
            if bs > cursor:
                result.append((cursor, bs))
            cursor = max(cursor, be)
            if cursor >= fe:
                break
        if cursor < fe:
            result.append((cursor, fe))
    return result


# --------------------------------------------------------------------------- pure engine


def compute_slots(
    *,
    day: date,
    timezone: str | ZoneInfo,
    duration_minutes: int,
    staff: Sequence[StaffSchedule],
    now: datetime,
    buffer_minutes: int = 0,
    min_notice_hours: int = 0,
    max_advance_days: int = 60,
    step_minutes: int = STEP_MINUTES,
) -> list[Slot]:
    """Open slots for `day` (a business-local date). Pure function."""
    if duration_minutes <= 0:
        raise ValueError("duration_minutes must be > 0")
    tz = timezone if isinstance(timezone, ZoneInfo) else ZoneInfo(timezone)
    now = _utc(now)
    duration = timedelta(minutes=duration_minutes)
    buffer = timedelta(minutes=max(buffer_minutes, 0))
    step = timedelta(minutes=step_minutes)
    earliest = now + timedelta(hours=max(min_notice_hours, 0))
    latest = now + timedelta(days=max_advance_days)
    weekday = day.weekday()

    by_start: dict[datetime, set[int]] = {}
    for sched in staff:
        windows = [
            (local_to_utc(day, w.start_time, tz), local_to_utc(day, w.end_time, tz))
            for w in sched.working_hours
            if w.weekday == weekday
        ]
        working = _merge(windows)
        if not working:
            continue
        blocked = _merge(
            [(_utc(s), _utc(e)) for s, e in sched.time_off]
            + [(_utc(s) - buffer, _utc(e) + buffer) for s, e in sched.bookings]
            + [(_utc(s), _utc(e)) for s, e in sched.busy_blocks]
        )
        free = _subtract(working, blocked)
        for ws, we in working:
            cursor = ws  # grid anchored on the working-interval start
            while cursor + duration <= we:
                end = cursor + duration
                if earliest <= cursor <= latest and any(
                    fs <= cursor and end <= fe for fs, fe in free
                ):
                    by_start.setdefault(cursor, set()).add(sched.staff_id)
                cursor += step

    return [
        Slot(start_at=start, end_at=start + duration, staff_ids=sorted(ids))
        for start, ids in sorted(by_start.items())
    ]


# --------------------------------------------------------------------------- DB loader


def active_booking_clause(now: datetime) -> ColumnElement[bool]:
    """SQL condition: bookings that currently occupy their slot."""
    return or_(
        Booking.status == BookingStatus.confirmed,
        and_(
            Booking.status == BookingStatus.pending_payment,
            or_(Booking.hold_expires_at.is_(None), Booking.hold_expires_at > now),
        ),
    )


def eligible_staff(
    db: Session, business: Business, service: Service, staff_id: int | None = None
) -> list[StaffMember]:
    stmt = (
        select(StaffMember)
        .join(StaffService, StaffService.staff_id == StaffMember.id)
        .where(
            StaffMember.business_id == business.id,
            StaffMember.is_active.is_(True),
            StaffService.service_id == service.id,
        )
        .order_by(StaffMember.id)
    )
    if staff_id is not None:
        stmt = stmt.where(StaffMember.id == staff_id)
    return list(db.scalars(stmt).all())


def load_schedules(
    db: Session,
    staff_ids: Sequence[int],
    window: Interval,
    now: datetime,
    exclude_booking_id: int | None = None,
) -> list[StaffSchedule]:
    if not staff_ids:
        return []
    w_start, w_end = window
    schedules = {
        sid: StaffSchedule(staff_id=sid, working_hours=[], time_off=[], bookings=[], busy_blocks=[])
        for sid in staff_ids
    }

    for wh in db.scalars(select(WorkingHours).where(WorkingHours.staff_id.in_(staff_ids))):
        schedules[wh.staff_id].working_hours.append(
            WorkingWindow(wh.weekday, wh.start_time, wh.end_time)
        )

    for to in db.scalars(
        select(TimeOff).where(
            TimeOff.staff_id.in_(staff_ids), TimeOff.start_at < w_end, TimeOff.end_at > w_start
        )
    ):
        schedules[to.staff_id].time_off.append((to.start_at, to.end_at))

    booking_stmt = select(Booking).where(
        Booking.staff_id.in_(staff_ids),
        Booking.start_at < w_end,
        Booking.end_at > w_start,
    )
    own_events: set[tuple[int, datetime, datetime]] = set()
    for b in db.scalars(booking_stmt):
        if b.google_event_id:
            own_events.add((b.staff_id, _utc(b.start_at), _utc(b.end_at)))
        if b.id == exclude_booking_id:
            continue
        is_active = b.status == BookingStatus.confirmed or (
            b.status == BookingStatus.pending_payment
            and (b.hold_expires_at is None or _utc(b.hold_expires_at) > now)
        )
        if is_active:
            schedules[b.staff_id].bookings.append((b.start_at, b.end_at))

    busy_rows = db.execute(
        select(CalendarConnection.staff_id, CalendarBusyBlock.start_at, CalendarBusyBlock.end_at)
        .join(CalendarConnection, CalendarConnection.id == CalendarBusyBlock.connection_id)
        .where(
            CalendarConnection.staff_id.in_(staff_ids),
            CalendarBusyBlock.start_at < w_end,
            CalendarBusyBlock.end_at > w_start,
        )
    ).all()
    for sid, start, end in busy_rows:
        if sid is None:
            continue
        # Ignore busy times that are SlotEase's own pushed events (best-effort match:
        # freebusy returns no event ids, so we match on the exact interval).
        if (sid, _utc(start), _utc(end)) in own_events:
            continue
        schedules[sid].busy_blocks.append((start, end))

    return [schedules[sid] for sid in staff_ids]


def get_open_slots(
    db: Session,
    business: Business,
    service: Service,
    day: date,
    staff_id: int | None,
    now: datetime,
    exclude_booking_id: int | None = None,
) -> list[Slot]:
    """Open slots for a business-local `day`. With `staff_id=None`, merges all staff
    offering the service. `exclude_booking_id` ignores one booking (used by reschedule)."""
    tz = ZoneInfo(business.timezone)
    staff = eligible_staff(db, business, service, staff_id)
    if not staff:
        return []
    day_start, day_end = day_bounds_utc(day, tz)
    pad = timedelta(minutes=business.booking_buffer_minutes + service.duration_minutes)
    schedules = load_schedules(
        db, [s.id for s in staff], (day_start - pad, day_end + pad), _utc(now), exclude_booking_id
    )
    return compute_slots(
        day=day,
        timezone=tz,
        duration_minutes=service.duration_minutes,
        staff=schedules,
        now=now,
        buffer_minutes=business.booking_buffer_minutes,
        min_notice_hours=business.min_notice_hours,
        max_advance_days=business.max_advance_days,
    )


def find_free_staff(
    db: Session,
    business: Business,
    service: Service,
    start_at: datetime,
    staff_id: int | None,
    now: datetime,
    exclude_booking_id: int | None = None,
) -> list[int]:
    """Staff ids free for a slot starting exactly at `start_at` (empty if not open)."""
    start_at = _utc(start_at)
    local_day = start_at.astimezone(ZoneInfo(business.timezone)).date()
    for slot in get_open_slots(db, business, service, local_day, staff_id, now, exclude_booking_id):
        if slot["start_at"] == start_at:
            return list(slot["staff_ids"])
    return []
