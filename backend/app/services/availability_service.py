"""Weekly working hours (replace-all) and time off for staff members.

Access: owner of the staff member's business, or the staff member themself (writes);
reads are allowed to any member of that business.
"""

import logging
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.dependencies import require_business_member
from app.exceptions import ForbiddenError, NotFoundError, ValidationAppError
from app.models import StaffMember, TimeOff, User, WorkingHours
from app.schemas.availability import TimeOffCreate, WorkingHoursIn

logger = logging.getLogger(__name__)

MAX_INTERVALS_PER_WEEK = 7 * 6


def _get_staff(db: Session, user: User, staff_id: int, write: bool) -> StaffMember:
    staff = db.get(StaffMember, staff_id)
    if staff is None:
        raise NotFoundError("Staff member not found")
    _business, member = require_business_member(db, user, staff.business_id)
    if write and member is not None and member.id != staff.id:
        raise ForbiddenError("You can only manage your own availability")
    return staff


def _check_no_overlap(hours: list[WorkingHoursIn]) -> None:
    if len(hours) > MAX_INTERVALS_PER_WEEK:
        raise ValidationAppError("Too many working-hour intervals")
    by_day: dict[int, list[WorkingHoursIn]] = {}
    for h in hours:
        by_day.setdefault(h.weekday, []).append(h)
    for day, intervals in by_day.items():
        intervals.sort(key=lambda i: i.start_time)
        for prev, cur in zip(intervals, intervals[1:], strict=False):
            if cur.start_time < prev.end_time:
                raise ValidationAppError(f"Overlapping working hours on weekday {day}")


def get_hours(db: Session, user: User, staff_id: int) -> Sequence[WorkingHours]:
    _get_staff(db, user, staff_id, write=False)
    return db.scalars(
        select(WorkingHours)
        .where(WorkingHours.staff_id == staff_id)
        .order_by(WorkingHours.weekday, WorkingHours.start_time)
    ).all()


def replace_hours(
    db: Session, user: User, staff_id: int, hours: list[WorkingHoursIn]
) -> Sequence[WorkingHours]:
    _get_staff(db, user, staff_id, write=True)
    _check_no_overlap(hours)
    db.execute(delete(WorkingHours).where(WorkingHours.staff_id == staff_id))
    db.add_all(
        WorkingHours(
            staff_id=staff_id, weekday=h.weekday, start_time=h.start_time, end_time=h.end_time
        )
        for h in hours
    )
    db.commit()
    logger.info("Working hours replaced staff_id=%s intervals=%s", staff_id, len(hours))
    return db.scalars(
        select(WorkingHours)
        .where(WorkingHours.staff_id == staff_id)
        .order_by(WorkingHours.weekday, WorkingHours.start_time)
    ).all()


def list_time_off(
    db: Session, user: User, staff_id: int, since: datetime | None = None
) -> Sequence[TimeOff]:
    _get_staff(db, user, staff_id, write=False)
    stmt = select(TimeOff).where(TimeOff.staff_id == staff_id)
    if since is not None:
        stmt = stmt.where(TimeOff.end_at > since)
    return db.scalars(stmt.order_by(TimeOff.start_at)).all()


def add_time_off(db: Session, user: User, staff_id: int, data: TimeOffCreate) -> TimeOff:
    _get_staff(db, user, staff_id, write=True)
    item = TimeOff(
        staff_id=staff_id,
        start_at=data.start_at,
        end_at=data.end_at,
        reason=data.reason.strip() if data.reason else None,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    logger.info("Time off added id=%s staff_id=%s", item.id, staff_id)
    return item


def delete_time_off(db: Session, user: User, time_off_id: int) -> None:
    item = db.get(TimeOff, time_off_id)
    if item is None:
        raise NotFoundError("Time off not found")
    _get_staff(db, user, item.staff_id, write=True)
    db.delete(item)
    db.commit()
    logger.info("Time off deleted id=%s", time_off_id)
