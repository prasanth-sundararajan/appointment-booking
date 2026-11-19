"""Staff management: invites (hashed tokens), acceptance, updates, removal."""

import logging
import secrets
from collections.abc import Sequence
from datetime import UTC, datetime

from fastapi import BackgroundTasks
from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.auth.security import hash_token
from app.config import settings
from app.dependencies import get_owned_business
from app.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationAppError
from app.models import (
    ACTIVE_BOOKING_STATUSES,
    Booking,
    Business,
    Service,
    StaffMember,
    User,
    UserRole,
)
from app.schemas.staff import InviteInfo, StaffInvite, StaffUpdate

logger = logging.getLogger(__name__)


def _send_invite_email(to: str, business_name: str, invite_url: str) -> None:
    """Background task; email module is owned by the notifications agent (lazy import)."""
    try:
        from app.services.email import send_staff_invite
    except ImportError:
        logger.warning("Email service unavailable; staff invite for %s not sent", to)
        return
    try:
        send_staff_invite(to, business_name, invite_url)
    except Exception:
        logger.exception("Failed to send staff invite email")


def _resolve_services(db: Session, business_id: int, service_ids: list[int]) -> list[Service]:
    if not service_ids:
        return []
    unique_ids = set(service_ids)
    services = db.scalars(
        select(Service).where(Service.id.in_(unique_ids), Service.business_id == business_id)
    ).all()
    if len(services) != len(unique_ids):
        raise ValidationAppError("One or more services do not belong to this business")
    return list(services)


def _staff_query() -> Select[tuple[StaffMember]]:
    return select(StaffMember).options(selectinload(StaffMember.services))


def list_public_staff(db: Session, business_id: int) -> Sequence[StaffMember]:
    business = db.get(Business, business_id)
    if business is None or not business.is_active:
        raise NotFoundError("Business not found")
    return db.scalars(
        _staff_query()
        .where(StaffMember.business_id == business_id, StaffMember.is_active.is_(True))
        .order_by(StaffMember.display_name)
    ).all()


def list_all_staff(db: Session, user: User, business_id: int) -> Sequence[StaffMember]:
    get_owned_business(db, user, business_id)
    return db.scalars(
        _staff_query()
        .where(StaffMember.business_id == business_id)
        .order_by(StaffMember.display_name)
    ).all()


def invite_staff(
    db: Session,
    user: User,
    business_id: int,
    data: StaffInvite,
    background_tasks: BackgroundTasks,
) -> StaffMember:
    business = get_owned_business(db, user, business_id)
    existing = db.scalar(
        select(StaffMember).where(
            StaffMember.business_id == business_id,
            func.lower(StaffMember.email) == data.email.lower(),
        )
    )
    if existing is not None:
        raise ConflictError("This email is already on the staff list", code="STAFF_EXISTS")

    raw_token = secrets.token_urlsafe(32)
    staff = StaffMember(
        business_id=business_id,
        display_name=data.display_name.strip(),
        email=data.email.lower(),
        invite_token=hash_token(raw_token),
        is_active=True,
    )
    staff.services = _resolve_services(db, business_id, data.service_ids)
    db.add(staff)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("This email is already on the staff list", code="STAFF_EXISTS") from exc
    db.refresh(staff)

    invite_url = f"{settings.FRONTEND_URL.rstrip('/')}/invite/{raw_token}"
    background_tasks.add_task(_send_invite_email, staff.email, business.name, invite_url)
    logger.info("Staff invited id=%s business_id=%s", staff.id, business_id)
    return staff


def _get_pending_invite(db: Session, raw_token: str) -> StaffMember:
    staff = db.scalar(_staff_query().where(StaffMember.invite_token == hash_token(raw_token)))
    if staff is None or not staff.is_active or staff.user_id is not None:
        raise NotFoundError("Invite not found or already used")
    if not staff.business.is_active:
        raise NotFoundError("Invite not found or already used")
    return staff


def get_invite_info(db: Session, raw_token: str) -> InviteInfo:
    staff = _get_pending_invite(db, raw_token)
    return InviteInfo(
        business_id=staff.business_id,
        business_name=staff.business.name,
        business_slug=staff.business.slug,
        display_name=staff.display_name,
        email=staff.email,
    )


def accept_invite(db: Session, user: User, raw_token: str) -> StaffMember:
    staff = _get_pending_invite(db, raw_token)
    if staff.email.lower() != user.email.lower():
        raise ForbiddenError("This invite was sent to a different email address")
    already = db.scalar(
        select(StaffMember.id).where(
            StaffMember.business_id == staff.business_id,
            StaffMember.user_id == user.id,
        )
    )
    if already is not None:
        raise ConflictError("You are already staff at this business")
    staff.user_id = user.id
    staff.invite_token = None
    if user.role == UserRole.customer:
        user.role = UserRole.staff
    db.commit()
    db.refresh(staff)
    logger.info("Staff invite accepted staff_id=%s user_id=%s", staff.id, user.id)
    return staff


def _get_owned_staff(db: Session, user: User, staff_id: int) -> StaffMember:
    staff = db.scalar(_staff_query().where(StaffMember.id == staff_id))
    if staff is None:
        raise NotFoundError("Staff member not found")
    get_owned_business(db, user, staff.business_id)
    return staff


def update_staff(db: Session, user: User, staff_id: int, data: StaffUpdate) -> StaffMember:
    staff = _get_owned_staff(db, user, staff_id)
    if data.display_name is not None:
        staff.display_name = data.display_name.strip()
    if data.is_active is not None:
        staff.is_active = data.is_active
    if data.service_ids is not None:
        staff.services = _resolve_services(db, staff.business_id, data.service_ids)
    db.commit()
    db.refresh(staff)
    return staff


def remove_staff(db: Session, user: User, staff_id: int) -> None:
    """Reject with future active bookings; hard delete if no history, else deactivate."""
    staff = _get_owned_staff(db, user, staff_id)
    now = datetime.now(UTC)
    future_active = db.scalar(
        select(func.count())
        .select_from(Booking)
        .where(
            Booking.staff_id == staff.id,
            Booking.status.in_(ACTIVE_BOOKING_STATUSES),
            Booking.end_at > now,
        )
    )
    if future_active:
        raise ConflictError(
            "Staff member has upcoming bookings; cancel or reassign them first",
            code="STAFF_HAS_BOOKINGS",
        )
    any_booking = db.scalar(select(Booking.id).where(Booking.staff_id == staff.id).limit(1))
    if any_booking is None:
        db.delete(staff)
        logger.info("Staff deleted id=%s", staff_id)
    else:
        staff.is_active = False
        staff.invite_token = None
        logger.info("Staff deactivated (has booking history) id=%s", staff_id)
    db.commit()
