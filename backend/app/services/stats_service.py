"""Dashboard stats for one business (owner sees all; staff see their own bookings)."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.dependencies import require_business_member
from app.models import Booking, BookingStatus, Payment, PaymentStatus, Service, User
from app.schemas.stats import BusinessStats, StatsBooking, TopService

TOP_SERVICES_LIMIT = 5
# Bookings that "happened" or will happen (not cancelled/expired).
COUNTED_STATUSES = (
    BookingStatus.pending_payment,
    BookingStatus.confirmed,
    BookingStatus.completed,
    BookingStatus.no_show,
)


def _local_day_bounds(tz: ZoneInfo, now: datetime) -> tuple[datetime, datetime]:
    local = now.astimezone(tz)
    start = datetime(local.year, local.month, local.day, tzinfo=tz)
    end = start + timedelta(days=1)
    return start.astimezone(UTC), end.astimezone(UTC)


def _local_week_bounds(tz: ZoneInfo, now: datetime) -> tuple[datetime, datetime]:
    local = now.astimezone(tz)
    monday = local.date() - timedelta(days=local.weekday())
    start = datetime(monday.year, monday.month, monday.day, tzinfo=tz)
    nxt = monday + timedelta(days=7)
    end = datetime(nxt.year, nxt.month, nxt.day, tzinfo=tz)
    return start.astimezone(UTC), end.astimezone(UTC)


def get_business_stats(
    db: Session, user: User, business_id: int, now: datetime | None = None
) -> BusinessStats:
    business, member = require_business_member(db, user, business_id)
    now = now or datetime.now(UTC)
    tz = ZoneInfo(business.timezone)

    scope: list[ColumnElement[bool]] = [Booking.business_id == business.id]
    if member is not None:
        scope.append(Booking.staff_id == member.id)

    day_start, day_end = _local_day_bounds(tz, now)
    today = db.scalars(
        select(Booking)
        .where(
            *scope,
            Booking.start_at >= day_start,
            Booking.start_at < day_end,
            Booking.status.in_(COUNTED_STATUSES),
        )
        .order_by(Booking.start_at)
    ).all()

    upcoming_count = (
        db.scalar(
            select(func.count())
            .select_from(Booking)
            .where(*scope, Booking.start_at >= now, Booking.status == BookingStatus.confirmed)
        )
        or 0
    )

    week_start, week_end = _local_week_bounds(tz, now)
    week_count = (
        db.scalar(
            select(func.count())
            .select_from(Booking)
            .where(
                *scope,
                Booking.start_at >= week_start,
                Booking.start_at < week_end,
                Booking.status.in_(
                    (BookingStatus.confirmed, BookingStatus.completed, BookingStatus.no_show)
                ),
            )
        )
        or 0
    )

    deposit_stmt = (
        select(func.coalesce(func.sum(Payment.amount_minor - Payment.refunded_amount_minor), 0))
        .select_from(Payment)
        .join(Booking, Booking.id == Payment.booking_id)
        .where(
            Payment.business_id == business.id,
            Payment.status.in_(
                (PaymentStatus.succeeded, PaymentStatus.refund_pending, PaymentStatus.refunded)
            ),
            *scope,
        )
    )
    deposits = int(db.scalar(deposit_stmt) or 0)

    top_rows = db.execute(
        select(Service.id, Service.name, func.count(Booking.id).label("cnt"))
        .join(Booking, Booking.service_id == Service.id)
        .where(
            *scope,
            Booking.status.in_(
                (BookingStatus.confirmed, BookingStatus.completed, BookingStatus.no_show)
            ),
        )
        .group_by(Service.id, Service.name)
        .order_by(func.count(Booking.id).desc(), Service.name)
        .limit(TOP_SERVICES_LIMIT)
    ).all()

    return BusinessStats(
        today_bookings=[StatsBooking.model_validate(b) for b in today],
        upcoming_count=int(upcoming_count),
        week_count=int(week_count),
        deposits_collected_minor=max(deposits, 0),
        currency=business.currency,
        top_services=[
            TopService(service_id=sid, name=name, count=int(cnt)) for sid, name, cnt in top_rows
        ],
    )
