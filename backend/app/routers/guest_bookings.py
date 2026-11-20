"""Guest booking for free consultation calls (no account needed).

Only businesses listed in GUEST_BOOKING_SLUGS accept guest bookings, and only for
services with a price of 0, so no payment is ever involved.
"""

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import AwareDatetime, BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_db
from app.exceptions import ForbiddenError, NotFoundError
from app.models import Business, Service, User, UserRole
from app.rate_limit import limiter
from app.services import booking_service as svc
from app.services.email_check import ensure_deliverable

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/public", tags=["guest-booking"])


class GuestBookingCreate(BaseModel):
    service_id: int
    start_at: AwareDatetime
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    topic: str = Field(default="", max_length=1000)
    website: str = Field(default="", max_length=200)  # honeypot


class GuestBookingResponse(BaseModel):
    ok: bool
    booking_id: int | None = None
    start_at: AwareDatetime | None = None
    end_at: AwareDatetime | None = None


def _allowed_slugs() -> set[str]:
    return {s.strip() for s in settings.GUEST_BOOKING_SLUGS.split(",") if s.strip()}


def _guest_user(db: Session, email: str, name: str) -> User:
    user = db.scalar(select(User).where(func.lower(User.email) == email.lower()))
    if user is None:
        user = User(email=email.lower(), full_name=name, role=UserRole.customer, is_active=True)
        db.add(user)
        db.flush()
    return user


@router.post("/businesses/{slug}/guest-bookings", response_model=GuestBookingResponse)
@limiter.limit("5/hour")
async def create_guest_booking(
    request: Request,
    slug: str,
    data: GuestBookingCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> GuestBookingResponse:
    if data.website:  # bot filled the hidden field
        return GuestBookingResponse(ok=True)
    if slug not in _allowed_slugs():
        raise ForbiddenError("Guest booking is not available for this business.")
    await run_in_threadpool(ensure_deliverable, str(data.email))

    def _run() -> tuple[GuestBookingResponse, svc.SideEffects]:
        business = db.scalar(select(Business).where(Business.slug == slug, Business.is_active))
        service = db.get(Service, data.service_id)
        if business is None or service is None or service.business_id != business.id:
            raise NotFoundError("Service not found.")
        if service.price_minor != 0 or not service.is_active:
            raise ForbiddenError("Only free calls can be booked without an account.")
        user = _guest_user(db, str(data.email), data.name.strip())
        if not user.is_active:
            raise ForbiddenError("This email cannot book right now.")
        note = f"Guest: {data.name.strip()}\nTopic: {data.topic.strip() or '-'}"
        result = svc.create_booking(
            db,
            customer=user,
            business_id=business.id,
            service_id=service.id,
            staff_id=None,
            start_at=data.start_at,
            customer_note=note,
        )
        b = result.booking
        return (
            GuestBookingResponse(ok=True, booking_id=b.id, start_at=b.start_at, end_at=b.end_at),
            result.effects,
        )

    response, effects = await run_in_threadpool(_run)
    background_tasks.add_task(svc.run_side_effects, effects)
    return response
