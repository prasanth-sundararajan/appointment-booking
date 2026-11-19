"""Booking lifecycle (PRP Modules 5 + 6): hold, checkout, webhook confirm, cancel/refund,
reschedule, status updates, listings and hold expiry.

All functions are synchronous (SQLAlchemy Session); routers call them through
`run_in_threadpool`. Side effects (WebSocket events, emails, Google Calendar pushes) are
collected in `SideEffects` and executed after the DB commit via `run_side_effects`,
usually from FastAPI BackgroundTasks.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.interfaces import LoaderOption

from app.config import settings
from app.exceptions import ConflictError, ForbiddenError, NotFoundError, PaymentError
from app.models import (
    ACTIVE_BOOKING_STATUSES,
    BOOKING_NO_OVERLAP_CONSTRAINT,
    Booking,
    BookingStatus,
    Business,
    CancelledBy,
    Payment,
    PaymentStatus,
    Service,
    User,
    WebhookEvent,
)
from app.realtime.manager import CHANNEL_DASHBOARD, CHANNEL_SLOTS, Channel, publish
from app.services import email as email_service
from app.services.deposit import calc_deposit
from app.services.payments import (
    PaymentProviderError,
    WebhookPayload,
    get_payment_provider,
)
from app.services.slot_engine import find_free_staff

logger = logging.getLogger(__name__)

SLOT_TAKEN = "SLOT_TAKEN"
INVALID_STATE = "INVALID_BOOKING_STATE"


# --------------------------------------------------------------------------- side effects


@dataclass
class SideEffects:
    events: list[tuple[int, Channel, dict[str, object]]] = field(default_factory=list)
    tasks: list[tuple[Callable[..., None], tuple[object, ...]]] = field(default_factory=list)
    calendar_booking_ids: list[int] = field(default_factory=list)

    def event(self, business_id: int, channel: Channel, payload: dict[str, object]) -> None:
        self.events.append((business_id, channel, payload))

    def task(self, fn: Callable[..., None], *args: object) -> None:
        self.tasks.append((fn, args))

    def calendar(self, booking_id: int) -> None:
        if booking_id not in self.calendar_booking_ids:
            self.calendar_booking_ids.append(booking_id)

    def extend(self, other: SideEffects) -> None:
        self.events.extend(other.events)
        self.tasks.extend(other.tasks)
        for bid in other.calendar_booking_ids:
            self.calendar(bid)


def _push_calendar(booking_id: int) -> None:
    try:
        from app.services.calendar_sync import push_booking_event
    except ImportError:
        logger.debug("calendar_sync not available; skipping push for booking %s", booking_id)
        return
    try:
        push_booking_event(booking_id)
    except Exception:
        logger.exception("Google Calendar push failed for booking %s", booking_id)


def run_side_effects(effects: SideEffects) -> None:
    """Execute side effects. Never raises. Call after commit (BackgroundTasks-friendly)."""
    for business_id, channel, payload in effects.events:
        try:
            publish(business_id, channel, payload)
        except Exception:
            logger.exception("Realtime publish failed")
    for booking_id in effects.calendar_booking_ids:
        _push_calendar(booking_id)
    for fn, args in effects.tasks:
        try:
            fn(*args)
        except Exception:
            logger.exception("Side-effect task %s failed", getattr(fn, "__name__", fn))


def _slot_event(
    kind: str,
    booking: Booking,
    *,
    staff_id: int | None = None,
    start_at: datetime | None = None,
    end_at: datetime | None = None,
) -> dict[str, object]:
    return {
        "type": kind,
        "data": {
            "staff_id": staff_id if staff_id is not None else booking.staff_id,
            "service_id": booking.service_id,
            "start_at": (start_at or booking.start_at).isoformat(),
            "end_at": (end_at or booking.end_at).isoformat(),
        },
    }


def _dashboard_event(kind: str, booking: Booking) -> dict[str, object]:
    return {
        "type": kind,
        "data": {
            "booking_id": booking.id,
            "staff_id": booking.staff_id,
            "service_id": booking.service_id,
            "start_at": booking.start_at.isoformat(),
            "end_at": booking.end_at.isoformat(),
            "status": booking.status.value,
        },
    }


# --------------------------------------------------------------------------- helpers


def _now(now: datetime | None) -> datetime:
    return (now or datetime.now(UTC)).astimezone(UTC)


def _is_overlap_error(exc: IntegrityError) -> bool:
    orig = exc.orig
    diag = getattr(orig, "diag", None)
    if diag is not None and getattr(diag, "constraint_name", None) == BOOKING_NO_OVERLAP_CONSTRAINT:
        return True
    if getattr(orig, "pgcode", None) == "23P01":  # exclusion_violation
        return True
    return BOOKING_NO_OVERLAP_CONSTRAINT in str(orig)


def _slot_taken() -> ConflictError:
    return ConflictError("This time slot is no longer available", code=SLOT_TAKEN)


BOOKING_LOAD: tuple[LoaderOption, ...] = (
    joinedload(Booking.business),
    joinedload(Booking.service),
    joinedload(Booking.staff),
    joinedload(Booking.customer),
    joinedload(Booking.payment),
)


def _lock_booking(db: Session, booking_id: int) -> Booking | None:
    stmt = (
        select(Booking)
        .where(Booking.id == booking_id)
        .options(*BOOKING_LOAD)
        .with_for_update(of=Booking)
        .execution_options(populate_existing=True)
    )
    return db.scalars(stmt).unique().first()


def _is_business_actor(booking: Booking, user: User) -> bool:
    """Owner of the business, or the staff member assigned to the booking."""
    if booking.business.owner_id == user.id:
        return True
    return (
        booking.staff.is_active
        and booking.staff.user_id is not None
        and booking.staff.user_id == user.id
    )


def _actor_role(booking: Booking, user: User) -> CancelledBy | None:
    if booking.customer_id == user.id:
        return CancelledBy.customer
    if _is_business_actor(booking, user):
        return CancelledBy.business
    return None


def _cutoff_at(booking: Booking) -> datetime:
    return booking.start_at - timedelta(hours=booking.business.cancellation_cutoff_hours)


@dataclass(frozen=True)
class RefundDecision:
    eligible: bool
    amount_minor: int
    currency: str
    cutoff_at: datetime


def refund_decision(booking: Booking, role: CancelledBy, now: datetime) -> RefundDecision:
    """Business Rule 4. Customer: full refund iff start - now >= cutoff. Business: always."""
    payment = booking.payment
    currency = payment.currency if payment else booking.business.currency
    cutoff_at = _cutoff_at(booking)
    paid = payment is not None and payment.status == PaymentStatus.succeeded
    eligible = paid and (role == CancelledBy.business or now <= cutoff_at)
    amount = payment.amount_minor if (eligible and payment is not None) else 0
    return RefundDecision(
        eligible=eligible, amount_minor=amount, currency=currency, cutoff_at=cutoff_at
    )


def _request_refund(payment: Payment) -> None:
    """Mark the deposit for refund. No provider call: the caller commits first, then
    calls `attempt_refund` (and `retry_pending_refunds` picks up any failure)."""
    payment.status = PaymentStatus.refund_pending
    payment.refund_failed = False


def refund_idempotency_key(payment_id: int) -> str:
    """Stable per payment, so retries can never create a second refund."""
    return f"slotease-refund-{payment_id}"


def attempt_refund(db: Session, payment_id: int, reason: str, skip_locked: bool = False) -> bool:
    """Ask the provider to refund a `refund_pending` payment that has no refund_id yet.

    Commits. Returns True when the provider accepted the refund. On failure the payment
    stays `refund_pending` (the scheduler retries). `refund.succeeded` webhooks (or an
    immediate "succeeded" response) move it to `refunded`.
    """
    payment = db.scalars(
        select(Payment)
        .where(Payment.id == payment_id)
        .with_for_update(skip_locked=skip_locked)
        .execution_options(populate_existing=True)
    ).first()
    if payment is None or payment.status != PaymentStatus.refund_pending or payment.refund_id:
        db.rollback()
        return False
    if payment.amount_minor <= 0:
        payment.status = PaymentStatus.refunded
        payment.refunded_amount_minor = 0
        db.commit()
        return True
    if not payment.provider_payment_id:
        logger.error("Payment %s has no provider reference; cannot refund", payment.id)
        db.rollback()
        return False
    try:
        result = get_payment_provider().refund(
            payment_id=payment.provider_payment_id,
            amount_minor=payment.amount_minor,
            reason=reason,
            idempotency_key=refund_idempotency_key(payment.id),
        )
    except PaymentProviderError:
        logger.warning("Refund for payment %s failed; will retry", payment.id, exc_info=True)
        db.rollback()
        return False
    payment.refund_id = result.refund_id
    if result.status == "succeeded":
        payment.status = PaymentStatus.refunded
        payment.refunded_amount_minor = payment.amount_minor
    db.commit()
    return True


def retry_pending_refunds(db: Session, limit: int = 50) -> int:
    """Scheduler job: retry provider refunds that were requested but never accepted."""
    ids = list(
        db.scalars(
            select(Payment.id)
            .where(Payment.status == PaymentStatus.refund_pending, Payment.refund_id.is_(None))
            .order_by(Payment.id)
            .limit(limit)
        )
    )
    db.rollback()
    done = 0
    for payment_id in ids:
        if attempt_refund(db, payment_id, reason="Booking cancelled", skip_locked=True):
            done += 1
    return done


def _confirm(booking: Booking, payment: Payment | None, effects: SideEffects) -> None:
    booking.status = BookingStatus.confirmed
    booking.hold_expires_at = None
    if payment is not None:
        payment.status = PaymentStatus.succeeded
    effects.event(
        booking.business_id, CHANNEL_DASHBOARD, _dashboard_event("booking.confirmed", booking)
    )
    effects.calendar(booking.id)
    effects.task(email_service.send_booking_confirmed, booking.id)


# --------------------------------------------------------------------------- create


def _expire_lapsed_holds(
    db: Session, staff_ids: Sequence[int], start_at: datetime, end_at: datetime, now: datetime
) -> list[Booking]:
    """Expire lapsed holds overlapping the interval. The slot engine already treats them
    as free, but they still match the exclusion constraint until the expiry job runs."""
    stale = list(
        db.scalars(
            select(Booking)
            .where(
                Booking.staff_id.in_(list(staff_ids)),
                Booking.status == BookingStatus.pending_payment,
                Booking.hold_expires_at.is_not(None),
                Booking.hold_expires_at <= now,
                Booking.start_at < end_at,
                Booking.end_at > start_at,
            )
            .with_for_update(skip_locked=True)
        ).all()
    )
    if not stale:
        return []
    for p in db.scalars(
        select(Payment).where(
            Payment.booking_id.in_([b.id for b in stale]),
            Payment.status == PaymentStatus.pending,
        )
    ):
        p.status = PaymentStatus.failed
    for b in stale:
        b.status = BookingStatus.expired
        b.hold_expires_at = None
    db.flush()
    return stale


@dataclass
class CreateBookingResult:
    booking: Booking
    payment: Payment
    checkout_url: str | None
    effects: SideEffects


def create_booking(
    db: Session,
    *,
    customer: User,
    business_id: int,
    service_id: int,
    staff_id: int | None,
    start_at: datetime,
    customer_note: str | None = None,
    now: datetime | None = None,
) -> CreateBookingResult:
    """Validate the slot, insert Booking (pending_payment, hold) + Payment (pending) and
    create a provider checkout. Raises ConflictError(SLOT_TAKEN) on overlap."""
    now = _now(now)
    business = db.get(Business, business_id)
    if business is None or not business.is_active:
        raise NotFoundError("Business not found")
    service = db.get(Service, service_id)
    if service is None or service.business_id != business.id or not service.is_active:
        raise NotFoundError("Service not found")
    if start_at.tzinfo is None:
        raise ConflictError("start_at must include a timezone", code="INVALID_START")
    start_at = start_at.astimezone(UTC)
    end_at = start_at + timedelta(minutes=service.duration_minutes)

    free_staff = find_free_staff(db, business, service, start_at, staff_id, now)
    if not free_staff:
        raise _slot_taken()

    deposit = calc_deposit(service.price_minor, business.deposit_percent)
    hold_until = now + timedelta(minutes=settings.HOLD_MINUTES)
    expired_holds = _expire_lapsed_holds(db, free_staff, start_at, end_at, now)

    booking: Booking | None = None
    payment: Payment | None = None
    for candidate in free_staff:
        try:
            with db.begin_nested():
                booking = Booking(
                    business_id=business.id,
                    service_id=service.id,
                    staff_id=candidate,
                    customer_id=customer.id,
                    start_at=start_at,
                    end_at=end_at,
                    status=BookingStatus.pending_payment,
                    hold_expires_at=hold_until,
                    customer_note=customer_note,
                )
                db.add(booking)
                db.flush()
                payment = Payment(
                    booking_id=booking.id,
                    business_id=business.id,
                    provider=get_payment_provider().name,
                    amount_minor=deposit,
                    currency=business.currency,
                    status=PaymentStatus.pending,
                )
                db.add(payment)
                db.flush()
            break
        except IntegrityError as exc:
            booking = payment = None
            if not _is_overlap_error(exc):
                db.rollback()
                raise
            continue
    if booking is None or payment is None:
        db.rollback()
        raise _slot_taken()

    effects = SideEffects()
    for old in expired_holds:
        effects.event(old.business_id, CHANNEL_DASHBOARD, _dashboard_event("booking.expired", old))
    effects.event(business.id, CHANNEL_SLOTS, _slot_event("slot.taken", booking))
    effects.event(business.id, CHANNEL_DASHBOARD, _dashboard_event("booking.created", booking))

    if deposit == 0:
        # Free service: nothing to charge, confirm right away.
        _confirm(booking, payment, effects)
        db.commit()
        return CreateBookingResult(booking, payment, None, effects)

    db.commit()  # the slot is now held; release row locks before calling the provider

    try:
        session = get_payment_provider().create_checkout(
            booking_id=booking.id,
            amount_minor=deposit,
            currency=business.currency,
            customer_email=customer.email,
            customer_name=customer.full_name,
            description=f"Deposit: {service.name} at {business.name}",
            return_url=f"{settings.FRONTEND_URL}/bookings/success?booking_id={booking.id}",
        )
    except PaymentProviderError as exc:
        logger.error("Checkout creation failed for booking %s", booking.id)
        booking.status = BookingStatus.expired
        booking.hold_expires_at = None
        payment.status = PaymentStatus.failed
        db.commit()
        raise PaymentError(
            "Could not start the payment, please try again", code="CHECKOUT_FAILED", status_code=502
        ) from exc

    payment.checkout_session_id = session.session_id
    if session.payment_id:
        payment.provider_payment_id = session.payment_id
    db.commit()
    return CreateBookingResult(booking, payment, session.checkout_url, effects)


# --------------------------------------------------------------------------- webhook


def _find_payment(db: Session, payload: WebhookPayload) -> Payment | None:
    stmt: Select[tuple[Payment]] | None = None
    if payload.booking_id is not None:
        stmt = select(Payment).where(Payment.booking_id == payload.booking_id)
    elif payload.payment_id:
        stmt = select(Payment).where(Payment.provider_payment_id == payload.payment_id)
    elif payload.checkout_session_id:
        stmt = select(Payment).where(Payment.checkout_session_id == payload.checkout_session_id)
    if stmt is None:
        return None
    payment = db.scalars(stmt.with_for_update()).first()
    if payment is None and payload.payment_id and payload.booking_id is not None:
        payment = db.scalars(
            select(Payment)
            .where(Payment.provider_payment_id == payload.payment_id)
            .with_for_update()
        ).first()
    return payment


def confirm_booking_payment(
    db: Session,
    payment: Payment,
    provider_payment_id: str | None,
    now: datetime | None = None,
) -> SideEffects:
    """Apply a verified "payment succeeded". Confirms the booking, or auto-refunds when
    the hold expired and the slot was taken / the booking was cancelled. No commit."""
    effects = SideEffects()
    booking = _lock_booking(db, payment.booking_id)
    if booking is None:
        return effects
    if provider_payment_id and not payment.provider_payment_id:
        payment.provider_payment_id = provider_payment_id
    if payment.status in (
        PaymentStatus.succeeded,
        PaymentStatus.refund_pending,
        PaymentStatus.refunded,
    ):
        return effects  # already applied

    if booking.status == BookingStatus.confirmed:
        payment.status = PaymentStatus.succeeded
        return effects

    if booking.status == BookingStatus.pending_payment:
        # The row still occupies the slot (exclusion constraint), so it is safe to confirm
        # even if the hold time passed but the expiry job has not run yet.
        _confirm(booking, payment, effects)
        return effects

    if booking.status == BookingStatus.expired:
        try:
            with db.begin_nested():
                booking.status = BookingStatus.confirmed
                booking.hold_expires_at = None
                db.flush()
        except IntegrityError as exc:
            if not _is_overlap_error(exc):
                raise
            booking.status = BookingStatus.expired
        else:
            _confirm(booking, payment, effects)
            effects.event(booking.business_id, CHANNEL_SLOTS, _slot_event("slot.taken", booking))
            logger.info("Late payment re-confirmed booking %s (slot still free)", booking.id)
            return effects

    # Slot was taken by someone else, or the booking was cancelled: refund automatically.
    logger.warning(
        "Auto-refunding late payment for booking %s (status=%s)", booking.id, booking.status.value
    )
    # Committed as refund_pending by the caller; the provider call happens after commit.
    _request_refund(payment)
    return effects


def _on_payment_failed(db: Session, payment: Payment) -> SideEffects:
    effects = SideEffects()
    if payment.status != PaymentStatus.pending:
        return effects
    # Lock first: _lock_booking uses populate_existing, which would discard an unflushed
    # change to this (joined-loaded) payment.
    booking = _lock_booking(db, payment.booking_id)
    payment.status = PaymentStatus.failed
    if booking is not None and booking.status == BookingStatus.pending_payment:
        booking.status = BookingStatus.expired
        booking.hold_expires_at = None
        effects.event(booking.business_id, CHANNEL_SLOTS, _slot_event("slot.freed", booking))
        effects.event(
            booking.business_id, CHANNEL_DASHBOARD, _dashboard_event("booking.expired", booking)
        )
    return effects


LATE_PAYMENT_REFUND_REASON = "Slot no longer available (payment arrived after hold expired)"


def _on_refund_succeeded(payment: Payment, payload: WebhookPayload) -> None:
    payment.status = PaymentStatus.refunded
    payment.refund_failed = False
    if payload.refund_id and not payment.refund_id:
        payment.refund_id = payload.refund_id
    payment.refunded_amount_minor = (
        payload.amount_minor if payload.amount_minor is not None else payment.amount_minor
    )


def _on_refund_failed(payment: Payment) -> None:
    """Provider rejected the refund: the money is still with the business. Flag it so the
    owner sees it in the payments list and can resolve it manually."""
    logger.error(
        "Refund failed at provider for payment %s (refund_id=%s); flagged for the owner",
        payment.id,
        payment.refund_id,
    )
    if payment.status in (PaymentStatus.refund_pending, PaymentStatus.refunded):
        payment.status = PaymentStatus.succeeded
        payment.refunded_amount_minor = 0
    payment.refund_failed = True


@dataclass
class WebhookResult:
    duplicate: bool
    effects: SideEffects


def handle_payment_webhook(
    db: Session, payload: WebhookPayload, now: datetime | None = None
) -> WebhookResult:
    """Idempotent webhook processing (dedup by WebhookEvent.event_id). Commits.
    Raises on processing errors so the provider retries (the event row rolls back too)."""
    now = _now(now)
    provider_name = get_payment_provider().name
    existing = db.scalars(
        select(WebhookEvent).where(WebhookEvent.event_id == payload.event_id)
    ).first()
    if existing is not None and existing.processed_at is not None:
        return WebhookResult(True, SideEffects())
    event = existing
    if event is None:
        event = WebhookEvent(
            provider=provider_name, event_id=payload.event_id, event_type=payload.event_type
        )
        db.add(event)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            return WebhookResult(True, SideEffects())

    effects = SideEffects()
    refund_payment_id: int | None = None
    try:
        payment = _find_payment(db, payload)
        if payment is None:
            logger.warning(
                "Webhook %s (%s): no matching payment", payload.event_id, payload.event_type
            )
        elif payload.event_type == "payment.succeeded":
            effects = confirm_booking_payment(db, payment, payload.payment_id, now)
            if payment.status == PaymentStatus.refund_pending and not payment.refund_id:
                refund_payment_id = payment.id
        elif payload.event_type in ("payment.failed", "payment.cancelled"):
            effects = _on_payment_failed(db, payment)
        elif payload.event_type == "refund.succeeded":
            _on_refund_succeeded(payment, payload)
        elif payload.event_type == "refund.failed":
            _on_refund_failed(payment)
        else:
            logger.info("Ignoring webhook type %s", payload.event_type)
        event.processed_at = now
        db.commit()
    except Exception:
        db.rollback()
        raise
    if refund_payment_id is not None:
        # The event is committed; a failed provider call is retried by the scheduler.
        attempt_refund(db, refund_payment_id, reason=LATE_PAYMENT_REFUND_REASON)
    return WebhookResult(False, effects)


# --------------------------------------------------------------------------- read


def get_booking_for_user(db: Session, booking_id: int, user: User) -> Booking:
    """Customer, business owner or assigned staff; 404 otherwise (no IDOR leak)."""
    booking = (
        db.scalars(select(Booking).where(Booking.id == booking_id).options(*BOOKING_LOAD))
        .unique()
        .first()
    )
    if booking is None or _actor_role(booking, user) is None:
        raise NotFoundError("Booking not found")
    return booking


def list_customer_bookings(
    db: Session,
    user: User,
    scope: str,
    now: datetime | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Booking], int]:
    now = _now(now)
    upcoming = (Booking.start_at >= now) & Booking.status.in_(ACTIVE_BOOKING_STATUSES)
    cond = upcoming if scope == "upcoming" else ~upcoming
    base = select(Booking).where(Booking.customer_id == user.id, cond)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    order = Booking.start_at.asc() if scope == "upcoming" else Booking.start_at.desc()
    items = (
        db.scalars(base.options(*BOOKING_LOAD).order_by(order).limit(limit).offset(offset))
        .unique()
        .all()
    )
    return list(items), int(total)


def list_business_bookings(
    db: Session,
    user: User,
    business_id: int,
    from_: datetime | None,
    to: datetime | None,
    staff_id: int | None,
    statuses: Sequence[BookingStatus] | None,
) -> list[Booking]:
    """Calendar data. Owners see everything; staff only their own bookings."""
    from app.dependencies import require_business_member

    business, staff_member = require_business_member(db, user, business_id)
    stmt = select(Booking).where(Booking.business_id == business.id)
    if business.owner_id != user.id:
        if staff_member is None:
            raise ForbiddenError()
        if staff_id is not None and staff_id != staff_member.id:
            raise ForbiddenError("Staff can only view their own bookings")
        staff_id = staff_member.id
    if staff_id is not None:
        stmt = stmt.where(Booking.staff_id == staff_id)
    if from_ is not None:
        stmt = stmt.where(Booking.end_at > from_)
    if to is not None:
        stmt = stmt.where(Booking.start_at < to)
    if statuses:
        stmt = stmt.where(Booking.status.in_(list(statuses)))
    else:
        stmt = stmt.where(Booking.status != BookingStatus.expired)
    stmt = stmt.options(*BOOKING_LOAD).order_by(Booking.start_at.asc()).limit(2000)
    return list(db.scalars(stmt).unique().all())


def list_business_payments(
    db: Session, user: User, business_id: int, from_: datetime | None, to: datetime | None
) -> tuple[Business, list[Payment]]:
    """Owner only."""
    from app.dependencies import get_owned_business

    business = get_owned_business(db, user, business_id)
    stmt = (
        select(Payment)
        .where(Payment.business_id == business.id)
        .options(
            joinedload(Payment.booking).joinedload(Booking.service),
            joinedload(Payment.booking).joinedload(Booking.customer),
        )
    )
    if from_ is not None:
        stmt = stmt.where(Payment.created_at >= from_)
    if to is not None:
        stmt = stmt.where(Payment.created_at < to)
    stmt = stmt.order_by(Payment.created_at.desc()).limit(1000)
    return business, list(db.scalars(stmt).unique().all())


# --------------------------------------------------------------------------- cancel


@dataclass
class CancelPreviewResult:
    can_cancel: bool
    role: CancelledBy
    decision: RefundDecision
    hours_until_start: float
    cutoff_hours: int


def cancel_preview(
    db: Session, booking_id: int, user: User, now: datetime | None = None
) -> CancelPreviewResult:
    now = _now(now)
    booking = get_booking_for_user(db, booking_id, user)
    role = _actor_role(booking, user)
    assert role is not None
    return CancelPreviewResult(
        can_cancel=booking.status in ACTIVE_BOOKING_STATUSES,
        role=role,
        decision=refund_decision(booking, role, now),
        hours_until_start=round((booking.start_at - now).total_seconds() / 3600, 2),
        cutoff_hours=booking.business.cancellation_cutoff_hours,
    )


@dataclass
class CancelResult:
    booking: Booking
    decision: RefundDecision
    effects: SideEffects


def cancel_booking(
    db: Session,
    booking_id: int,
    user: User,
    reason: str | None = None,
    now: datetime | None = None,
) -> CancelResult:
    """Cancel (customer or business). Refund per Business Rule 4. Commits."""
    now = _now(now)
    booking = _lock_booking(db, booking_id)
    if booking is None:
        raise NotFoundError("Booking not found")
    role = _actor_role(booking, user)
    if role is None:
        raise NotFoundError("Booking not found")
    if booking.status not in ACTIVE_BOOKING_STATUSES:
        db.rollback()
        raise ConflictError("This booking can no longer be cancelled", code=INVALID_STATE)

    decision = refund_decision(booking, role, now)
    payment = booking.payment
    refund_payment_id: int | None = None
    if payment is not None:
        if decision.eligible:
            # Commit the cancellation with the refund pending first, then call the provider.
            _request_refund(payment)
            refund_payment_id = payment.id
        elif payment.status == PaymentStatus.pending:
            payment.status = PaymentStatus.failed

    booking.status = BookingStatus.cancelled
    booking.cancelled_by = role
    booking.cancelled_at = now
    booking.hold_expires_at = None
    db.commit()
    if refund_payment_id is not None:
        # On provider failure the payment stays refund_pending; the scheduler retries.
        attempt_refund(db, refund_payment_id, reason=reason or f"Cancelled by {role.value}")

    effects = SideEffects()
    effects.event(booking.business_id, CHANNEL_SLOTS, _slot_event("slot.freed", booking))
    effects.event(
        booking.business_id, CHANNEL_DASHBOARD, _dashboard_event("booking.cancelled", booking)
    )
    effects.calendar(booking.id)
    effects.task(
        email_service.send_booking_cancelled,
        booking.id,
        decision.eligible,
        decision.amount_minor,
        role.value,
    )
    return CancelResult(booking, decision, effects)


# --------------------------------------------------------------------------- reschedule


@dataclass
class RescheduleResult:
    booking: Booking
    effects: SideEffects


def reschedule_booking(
    db: Session,
    booking_id: int,
    user: User,
    new_start_at: datetime,
    staff_id: int | None = None,
    now: datetime | None = None,
) -> RescheduleResult:
    """Move a confirmed booking to a new open slot, keeping the deposit (Business Rule 5).
    Customers must request before the cancellation cutoff; the business may move any time."""
    now = _now(now)
    booking = _lock_booking(db, booking_id)
    if booking is None:
        raise NotFoundError("Booking not found")
    role = _actor_role(booking, user)
    if role is None:
        raise NotFoundError("Booking not found")
    if booking.status != BookingStatus.confirmed:
        db.rollback()
        raise ConflictError("Only confirmed bookings can be rescheduled", code=INVALID_STATE)
    if role == CancelledBy.customer and now > _cutoff_at(booking):
        db.rollback()
        raise ConflictError(
            f"Bookings can only be rescheduled at least "
            f"{booking.business.cancellation_cutoff_hours}h before the start time",
            code="RESCHEDULE_CUTOFF_PASSED",
        )
    if new_start_at.tzinfo is None:
        db.rollback()
        raise ConflictError("start_at must include a timezone", code="INVALID_START")
    new_start_at = new_start_at.astimezone(UTC)

    free = find_free_staff(
        db,
        booking.business,
        booking.service,
        new_start_at,
        staff_id,
        now,
        exclude_booking_id=booking.id,
    )
    if not free:
        db.rollback()
        raise _slot_taken()
    new_staff = booking.staff_id if (staff_id is None and booking.staff_id in free) else free[0]

    old_staff, old_start, old_end = booking.staff_id, booking.start_at, booking.end_at
    try:
        with db.begin_nested():
            booking.staff_id = new_staff
            booking.start_at = new_start_at
            booking.end_at = new_start_at + timedelta(minutes=booking.service.duration_minutes)
            db.flush()
    except IntegrityError as exc:
        db.rollback()
        if _is_overlap_error(exc):
            raise _slot_taken() from exc
        raise
    db.commit()
    db.refresh(booking, attribute_names=["staff"])

    effects = SideEffects()
    effects.event(
        booking.business_id,
        CHANNEL_SLOTS,
        _slot_event("slot.freed", booking, staff_id=old_staff, start_at=old_start, end_at=old_end),
    )
    effects.event(booking.business_id, CHANNEL_SLOTS, _slot_event("slot.taken", booking))
    effects.event(
        booking.business_id, CHANNEL_DASHBOARD, _dashboard_event("booking.rescheduled", booking)
    )
    effects.calendar(booking.id)
    effects.task(email_service.send_booking_rescheduled, booking.id, old_start)
    return RescheduleResult(booking, effects)


# --------------------------------------------------------------------------- status


def update_booking_status(
    db: Session,
    booking_id: int,
    user: User,
    status: BookingStatus,
    now: datetime | None = None,
) -> tuple[Booking, SideEffects]:
    """Owner/assigned staff mark a started confirmed booking completed or no_show."""
    now = _now(now)
    if status not in (BookingStatus.completed, BookingStatus.no_show):
        raise ConflictError("Status must be completed or no_show", code=INVALID_STATE)
    booking = _lock_booking(db, booking_id)
    if booking is None:
        raise NotFoundError("Booking not found")
    if not _is_business_actor(booking, user):
        if booking.customer_id == user.id:
            db.rollback()
            raise ForbiddenError("Only the business can update the booking status")
        raise NotFoundError("Booking not found")
    if booking.status not in (
        BookingStatus.confirmed,
        BookingStatus.completed,
        BookingStatus.no_show,
    ):
        db.rollback()
        raise ConflictError("Only confirmed bookings can be updated", code=INVALID_STATE)
    if now < booking.start_at:
        db.rollback()
        raise ConflictError("The booking has not started yet", code=INVALID_STATE)
    booking.status = status
    db.commit()
    effects = SideEffects()
    effects.event(
        booking.business_id, CHANNEL_DASHBOARD, _dashboard_event("booking.updated", booking)
    )
    return booking, effects


# --------------------------------------------------------------------------- expiry job


def expire_holds(db: Session, now: datetime) -> int:
    """Scheduler job (every minute): expire overdue holds, fail their payments and
    broadcast `slot.freed`. Returns the number of expired bookings. Commits."""
    now = _now(now)
    stmt = (
        select(Booking)
        .where(
            Booking.status == BookingStatus.pending_payment,
            Booking.hold_expires_at.is_not(None),
            Booking.hold_expires_at <= now,
        )
        .with_for_update(skip_locked=True)
        .limit(500)
    )
    bookings = list(db.scalars(stmt).all())
    if not bookings:
        db.rollback()
        return 0
    ids = [b.id for b in bookings]
    payments = db.scalars(
        select(Payment).where(Payment.booking_id.in_(ids), Payment.status == PaymentStatus.pending)
    ).all()
    for p in payments:
        p.status = PaymentStatus.failed
    effects = SideEffects()
    for b in bookings:
        b.status = BookingStatus.expired
        b.hold_expires_at = None
        effects.event(b.business_id, CHANNEL_SLOTS, _slot_event("slot.freed", b))
        effects.event(b.business_id, CHANNEL_DASHBOARD, _dashboard_event("booking.expired", b))
    db.commit()
    run_side_effects(effects)
    logger.info("Expired %d booking hold(s)", len(bookings))
    return len(bookings)
