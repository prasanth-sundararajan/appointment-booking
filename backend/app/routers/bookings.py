"""Booking endpoints (PRP Module 5). Paths are absolute; include with no prefix."""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Body, Depends, Query, Request, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models import Booking, BookingStatus, User
from app.rate_limit import limiter
from app.schemas.booking import (
    BookingCreate,
    BookingCreateResponse,
    BookingListResponse,
    BookingOut,
    CancelPreview,
    CancelRequest,
    CancelResponse,
    RefundInfo,
    RescheduleRequest,
    StatusUpdate,
)
from app.services import booking_service as svc

router = APIRouter(tags=["bookings"])


def _out(booking: Booking) -> BookingOut:
    return BookingOut.model_validate(booking)


@router.post(
    "/api/bookings", response_model=BookingCreateResponse, status_code=status.HTTP_201_CREATED
)
@limiter.limit("10/minute")
async def create_booking(
    request: Request,
    data: BookingCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingCreateResponse:
    """Hold the slot for HOLD_MINUTES and return the deposit checkout URL. 409 SLOT_TAKEN."""

    def _run() -> tuple[BookingCreateResponse, svc.SideEffects]:
        result = svc.create_booking(
            db,
            customer=user,
            business_id=data.business_id,
            service_id=data.service_id,
            staff_id=data.staff_id,
            start_at=data.start_at,
            customer_note=data.customer_note,
        )
        b, p = result.booking, result.payment
        response = BookingCreateResponse(
            booking_id=b.id,
            status=b.status,
            checkout_url=result.checkout_url,
            hold_expires_at=b.hold_expires_at,
            deposit_amount_minor=p.amount_minor,
            currency=p.currency,
            staff_id=b.staff_id,
            start_at=b.start_at,
            end_at=b.end_at,
        )
        return response, result.effects

    response, effects = await run_in_threadpool(_run)
    background_tasks.add_task(svc.run_side_effects, effects)
    return response


@router.get("/api/me/bookings", response_model=BookingListResponse)
async def my_bookings(
    scope: Literal["upcoming", "past"] = Query("upcoming"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingListResponse:
    def _run() -> BookingListResponse:
        items, total = svc.list_customer_bookings(db, user, scope, limit=limit, offset=offset)
        return BookingListResponse(items=[_out(b) for b in items], total=total)

    return await run_in_threadpool(_run)


@router.get("/api/bookings/{booking_id}", response_model=BookingOut)
async def get_booking(
    booking_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingOut:
    return await run_in_threadpool(lambda: _out(svc.get_booking_for_user(db, booking_id, user)))


@router.get("/api/bookings/{booking_id}/cancel-preview", response_model=CancelPreview)
async def cancel_preview(
    booking_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CancelPreview:
    def _run() -> CancelPreview:
        p = svc.cancel_preview(db, booking_id, user)
        return CancelPreview(
            can_cancel=p.can_cancel,
            cancelled_by=p.role,
            refund=RefundInfo(
                eligible=p.decision.eligible,
                amount_minor=p.decision.amount_minor,
                currency=p.decision.currency,
            ),
            cutoff_at=p.decision.cutoff_at,
            cutoff_hours=p.cutoff_hours,
            hours_until_start=p.hours_until_start,
        )

    return await run_in_threadpool(_run)


@router.post("/api/bookings/{booking_id}/cancel", response_model=CancelResponse)
async def cancel_booking(
    booking_id: int,
    background_tasks: BackgroundTasks,
    data: CancelRequest | None = Body(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CancelResponse:
    """Customer >= cutoff: full refund; later: none. Business: always full refund."""

    def _run() -> tuple[CancelResponse, svc.SideEffects]:
        result = svc.cancel_booking(db, booking_id, user, reason=data.reason if data else None)
        d = result.decision
        response = CancelResponse(
            booking=_out(result.booking),
            refund=RefundInfo(
                eligible=d.eligible, amount_minor=d.amount_minor, currency=d.currency
            ),
        )
        return response, result.effects

    response, effects = await run_in_threadpool(_run)
    background_tasks.add_task(svc.run_side_effects, effects)
    return response


@router.post("/api/bookings/{booking_id}/reschedule", response_model=BookingOut)
async def reschedule_booking(
    booking_id: int,
    data: RescheduleRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingOut:
    def _run() -> tuple[BookingOut, svc.SideEffects]:
        result = svc.reschedule_booking(db, booking_id, user, data.start_at, data.staff_id)
        return _out(result.booking), result.effects

    response, effects = await run_in_threadpool(_run)
    background_tasks.add_task(svc.run_side_effects, effects)
    return response


@router.patch("/api/bookings/{booking_id}/status", response_model=BookingOut)
async def update_booking_status(
    booking_id: int,
    data: StatusUpdate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BookingOut:
    def _run() -> tuple[BookingOut, svc.SideEffects]:
        booking, effects = svc.update_booking_status(db, booking_id, user, data.status)
        return _out(booking), effects

    response, effects = await run_in_threadpool(_run)
    background_tasks.add_task(svc.run_side_effects, effects)
    return response


@router.get("/api/businesses/{business_id}/bookings", response_model=list[BookingOut])
async def business_bookings(
    business_id: int,
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = Query(None),
    staff_id: int | None = Query(None),
    status_: list[BookingStatus] | None = Query(None, alias="status"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BookingOut]:
    """Calendar data for owners (all) and staff (own bookings only)."""

    def _run() -> list[BookingOut]:
        items = svc.list_business_bookings(db, user, business_id, from_, to, staff_id, status_)
        return [_out(b) for b in items]

    return await run_in_threadpool(_run)
