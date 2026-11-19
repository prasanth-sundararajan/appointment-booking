"""Payment schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import PaymentStatus


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    booking_id: int
    business_id: int
    provider: str
    provider_payment_id: str | None
    amount_minor: int
    currency: str
    status: PaymentStatus
    refund_id: str | None
    refunded_amount_minor: int
    refund_failed: bool = False  # provider rejected the refund; needs manual handling
    created_at: datetime
    updated_at: datetime


class PaymentListItem(PaymentOut):
    booking_start_at: datetime
    service_name: str
    customer_name: str
    customer_email: str


class PaymentTotals(BaseModel):
    currency: str
    collected_minor: int
    refunded_minor: int
    net_minor: int
    count: int


class PaymentListResponse(BaseModel):
    items: list[PaymentListItem]
    totals: PaymentTotals


class WebhookAck(BaseModel):
    received: bool = True
    duplicate: bool = False
