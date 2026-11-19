"""Slot engine: pure compute_slots (timezone/DST, buffer, notice, advance, time off, busy
blocks) plus DB-backed get_open_slots (holds, busy blocks, reschedule exclusion)."""

from collections.abc import Callable
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy.orm import Session

from app.models import BookingStatus, CalendarBusyBlock
from app.services.slot_engine import (
    StaffSchedule,
    WorkingWindow,
    compute_slots,
    day_bounds_utc,
    find_free_staff,
    get_open_slots,
)
from tests.conftest import World, at

NY = ZoneInfo("America/New_York")
DAY = date(2030, 6, 3)  # a Monday
EARLY = datetime(2030, 1, 1, tzinfo=UTC)  # "now" well before DAY


def _sched(
    windows: list[tuple[int, time, time]] | None = None, staff_id: int = 1, **kw: Any
) -> StaffSchedule:
    windows = windows if windows is not None else [(DAY.weekday(), time(9), time(12))]
    return StaffSchedule(
        staff_id=staff_id, working_hours=[WorkingWindow(*w) for w in windows], **kw
    )


def _starts(slots: list[Any], tz: Any = UTC) -> list[str]:
    return [s["start_at"].astimezone(tz).strftime("%H:%M") for s in slots]


def _compute(staff: list[StaffSchedule], **kw: Any) -> list[Any]:
    params: dict[str, Any] = {
        "day": DAY,
        "timezone": "UTC",
        "duration_minutes": 60,
        "now": EARLY,
        "max_advance_days": 3650,
    }
    params.update(kw)
    return compute_slots(staff=staff, **params)


def test_basic_grid() -> None:
    slots = _compute([_sched()])
    assert _starts(slots) == [
        "09:00",
        "09:15",
        "09:30",
        "09:45",
        "10:00",
        "10:15",
        "10:30",
        "10:45",
        "11:00",
    ]
    assert slots[0]["end_at"] - slots[0]["start_at"] == timedelta(hours=1)


def test_other_weekday_has_no_slots() -> None:
    assert _compute([_sched([(DAY.weekday() + 1, time(9), time(12))])]) == []


def test_business_timezone_conversion() -> None:
    slots = _compute([_sched()], timezone="Asia/Kolkata")
    assert slots[0]["start_at"] == datetime(2030, 6, 3, 3, 30, tzinfo=UTC)  # 09:00 IST


def test_dst_spring_forward_and_fall_back() -> None:
    # 2030-03-10: US spring forward; 9:00 EDT = 13:00 UTC, day before 9:00 EST = 14:00 UTC.
    spring = date(2030, 3, 10)
    before = spring - timedelta(days=1)
    for day, utc_hour in ((before, 14), (spring, 13)):
        slots = _compute([_sched([(day.weekday(), time(9), time(10))])], day=day, timezone=NY)
        assert slots[0]["start_at"] == datetime(day.year, day.month, day.day, utc_hour, tzinfo=UTC)
        assert _starts(slots, NY) == ["09:00"]

    # Night shift 00:00-04:00 local on the spring-forward day is only 3 real hours.
    night = _compute([_sched([(spring.weekday(), time(0), time(4))])], day=spring, timezone=NY)
    assert night[0]["start_at"] == datetime(2030, 3, 10, 5, tzinfo=UTC)
    assert night[-1]["end_at"] == datetime(2030, 3, 10, 8, tzinfo=UTC)

    # 2030-11-03: fall back; 00:00-03:00 local spans 4 real hours.
    fall = date(2030, 11, 3)
    night = _compute([_sched([(fall.weekday(), time(0), time(3))])], day=fall, timezone=NY)
    assert night[0]["start_at"] == datetime(2030, 11, 3, 4, tzinfo=UTC)
    assert night[-1]["end_at"] == datetime(2030, 11, 3, 8, tzinfo=UTC)

    start, end = day_bounds_utc(spring, NY)
    assert end - start == timedelta(hours=23)
    start, end = day_bounds_utc(fall, NY)
    assert end - start == timedelta(hours=25)


def test_buffer_pads_existing_bookings() -> None:
    booking = (at(DAY, 10), at(DAY, 11))
    slots = _compute([_sched(bookings=[booking])], duration_minutes=30, buffer_minutes=15)
    # Blocked 09:45-11:15.
    assert _starts(slots) == ["09:00", "09:15", "11:15", "11:30"]
    no_buffer = _compute([_sched(bookings=[booking])], duration_minutes=30)
    assert _starts(no_buffer) == ["09:00", "09:15", "09:30", "11:00", "11:15", "11:30"]


def test_min_notice() -> None:
    now = at(DAY, 8)
    slots = _compute([_sched()], now=now, min_notice_hours=2)
    assert _starts(slots)[0] == "10:00"


def test_max_advance() -> None:
    now = at(DAY, 9) - timedelta(days=30)
    assert _compute([_sched()], now=now, max_advance_days=29) == []
    # Boundary: a start exactly at now + max_advance is still allowed.
    assert _starts(_compute([_sched()], now=now, max_advance_days=30)) == ["09:00"]


def test_time_off_and_busy_blocks() -> None:
    off = _compute([_sched(time_off=[(at(DAY, 9), at(DAY, 10, 30))])])
    assert _starts(off)[0] == "10:30"
    busy = _compute([_sched(busy_blocks=[(at(DAY, 10), at(DAY, 10, 15))])])
    assert _starts(busy) == ["09:00", "10:15", "10:30", "10:45", "11:00"]


def test_multiple_staff_merge() -> None:
    a = _sched(staff_id=1)
    b = _sched([(DAY.weekday(), time(11), time(13))], staff_id=2)
    slots = {s["start_at"].strftime("%H:%M"): s["staff_ids"] for s in _compute([a, b])}
    assert slots["09:00"] == [1]
    assert slots["11:00"] == [1, 2]
    assert slots["12:00"] == [2]


def test_split_shift_grid_anchored_per_window() -> None:
    windows = [(DAY.weekday(), time(9), time(10)), (DAY.weekday(), time(13, 10), time(14, 10))]
    assert _starts(_compute([_sched(windows)])) == ["09:00", "13:10"]


def test_invalid_inputs() -> None:
    with pytest.raises(ValueError):
        _compute([_sched()], duration_minutes=0)
    with pytest.raises(ValueError):
        _compute([_sched()], now=datetime(2030, 1, 1))  # naive


# --------------------------------------------------------------------------- DB-backed


def _open(db: Session, w: World, now: datetime | None = None, **kw: Any) -> list[str]:
    slots = get_open_slots(db, w.business, w.service, w.day, None, now or datetime.now(UTC), **kw)
    return [s["start_at"].strftime("%H:%M") for s in slots]


def test_holds_block_until_expired(
    db: Session, world: World, make_booking: Callable[..., Any]
) -> None:
    now = datetime.now(UTC)
    make_booking(
        world.service,
        world.staff,
        world.customer,
        at(world.day, 10),
        status=BookingStatus.pending_payment,
        paid=False,
        hold_expires_at=now + timedelta(minutes=5),
    )
    assert "10:00" not in _open(db, world, now)
    # Same hold seen from a moment after it expired: slot is open again.
    assert "10:00" in _open(db, world, now + timedelta(minutes=6))


def test_inactive_bookings_do_not_block(
    db: Session, world: World, make_booking: Callable[..., Any]
) -> None:
    for status, hour in ((BookingStatus.cancelled, 10), (BookingStatus.expired, 12)):
        make_booking(world.service, world.staff, world.customer, at(world.day, hour), status=status)
    slots = _open(db, world)
    assert "10:00" in slots and "12:00" in slots


def test_confirmed_booking_and_exclusion(
    db: Session, world: World, make_booking: Callable[..., Any]
) -> None:
    booking = make_booking(world.service, world.staff, world.customer, at(world.day, 10))
    assert "10:00" not in _open(db, world)
    assert "10:00" in _open(db, world, exclude_booking_id=booking.id)
    now = datetime.now(UTC)
    assert find_free_staff(db, world.business, world.service, at(world.day, 10), None, now) == []
    assert find_free_staff(db, world.business, world.service, at(world.day, 11), None, now) == [
        world.staff.id
    ]
    # Off-grid start is never bookable.
    assert find_free_staff(db, world.business, world.service, at(world.day, 11, 5), None, now) == []


def test_busy_blocks_from_db(
    db: Session,
    world: World,
    make_connection: Callable[..., Any],
    make_booking: Callable[..., Any],
) -> None:
    conn = make_connection(world.owner, world.staff)
    db.add(
        CalendarBusyBlock(
            connection_id=conn.id, start_at=at(world.day, 9), end_at=at(world.day, 11)
        )
    )
    db.commit()
    assert _open(db, world)[0] == "11:00"

    # A busy block that is exactly SlotEase's own pushed event is ignored.
    own = make_booking(world.service, world.staff, world.customer, at(world.day, 14))
    own.google_event_id = "evt_own"
    db.add(
        CalendarBusyBlock(
            connection_id=conn.id, start_at=at(world.day, 14), end_at=at(world.day, 15)
        )
    )
    db.commit()
    slots = _open(db, world, exclude_booking_id=own.id)
    assert "14:00" in slots


def test_no_eligible_staff(db: Session, world: World, make_service: Callable[..., Any]) -> None:
    lonely = make_service(world.business, name="Nobody does this")
    assert get_open_slots(db, world.business, lonely, world.day, None, datetime.now(UTC)) == []
