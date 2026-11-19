"""Payments: Dodo webhook + owner payment list (PRP Module 6). Include with no prefix."""

import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.exceptions import AppError
from app.models import PaymentStatus, User
from app.schemas.payment import PaymentListItem, PaymentListResponse, PaymentTotals, WebhookAck
from app.services import booking_service as svc
from app.services.payments import WebhookVerificationError, get_payment_provider

logger = logging.getLogger(__name__)

router = APIRouter(tags=["payments"])


@router.post("/api/payments/dodo/webhook", response_model=WebhookAck)
async def dodo_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> WebhookAck:
    """Standard Webhooks signature check, then idempotent processing via WebhookEvent."""
    body = await request.body()
    provider = get_payment_provider()
    try:
        payload = provider.verify_webhook(body, dict(request.headers))
    except WebhookVerificationError as exc:
        logger.warning("Rejected webhook: %s", exc)
        raise AppError(
            "Invalid webhook signature", code="INVALID_SIGNATURE", status_code=401
        ) from exc

    result = await run_in_threadpool(svc.handle_payment_webhook, db, payload)
    background_tasks.add_task(svc.run_side_effects, result.effects)
    return WebhookAck(received=True, duplicate=result.duplicate)


@router.get("/api/businesses/{business_id}/payments", response_model=PaymentListResponse)
async def business_payments(
    business_id: int,
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PaymentListResponse:
    """Deposits and refunds of a business (owner only)."""

    def _run() -> PaymentListResponse:
        business, payments = svc.list_business_payments(db, user, business_id, from_, to)
        items: list[PaymentListItem] = []
        collected = refunded = 0
        for p in payments:
            if p.status in (
                PaymentStatus.succeeded,
                PaymentStatus.refund_pending,
                PaymentStatus.refunded,
            ):
                collected += p.amount_minor
            refunded += p.refunded_amount_minor
            base = PaymentListItem.model_validate(
                {
                    **{
                        k: getattr(p, k)
                        for k in (
                            "id",
                            "booking_id",
                            "business_id",
                            "provider",
                            "provider_payment_id",
                            "amount_minor",
                            "currency",
                            "status",
                            "refund_id",
                            "refunded_amount_minor",
                            "refund_failed",
                            "created_at",
                            "updated_at",
                        )
                    },
                    "booking_start_at": p.booking.start_at,
                    "service_name": p.booking.service.name,
                    "customer_name": p.booking.customer.full_name,
                    "customer_email": p.booking.customer.email,
                }
            )
            items.append(base)
        totals = PaymentTotals(
            currency=business.currency,
            collected_minor=collected,
            refunded_minor=refunded,
            net_minor=collected - refunded,
            count=len(items),
        )
        return PaymentListResponse(items=items, totals=totals)

    return await run_in_threadpool(_run)
