"""Booking schemas."""

from datetime import datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from app.models.enums import BookingStatus, CancelledBy
from app.schemas.payment import PaymentOut


class BookingCreate(BaseModel):
    business_id: int
    service_id: int
    staff_id: int | None = None  # None = any available staff
    start_at: AwareDatetime
    customer_note: str | None = Field(default=None, max_length=1000)


class BookingCreateResponse(BaseModel):
    booking_id: int
    status: BookingStatus
    checkout_url: str | None  # None when the deposit is 0 (booking confirmed directly)
    hold_expires_at: datetime | None
    deposit_amount_minor: int
    currency: str
    staff_id: int
    start_at: datetime
    end_at: datetime


class BookingBusinessSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    timezone: str
    currency: str
    cancellation_cutoff_hours: int


class BookingServiceSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    duration_minutes: int
    price_minor: int


class BookingStaffSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    display_name: str


class BookingCustomerSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: str


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    service_id: int
    staff_id: int
    customer_id: int
    start_at: datetime
    end_at: datetime
    status: BookingStatus
    hold_expires_at: datetime | None
    customer_note: str | None
    cancelled_by: CancelledBy | None
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime
    business: BookingBusinessSummary
    service: BookingServiceSummary
    staff: BookingStaffSummary
    customer: BookingCustomerSummary
    payment: PaymentOut | None


class BookingListResponse(BaseModel):
    items: list[BookingOut]
    total: int


class RefundInfo(BaseModel):
    eligible: bool
    amount_minor: int
    currency: str


class CancelRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class CancelResponse(BaseModel):
    booking: BookingOut
    refund: RefundInfo


class CancelPreview(BaseModel):
    can_cancel: bool
    cancelled_by: CancelledBy
    refund: RefundInfo
    cutoff_at: datetime
    cutoff_hours: int
    hours_until_start: float


class RescheduleRequest(BaseModel):
    start_at: AwareDatetime
    staff_id: int | None = None  # None = keep current staff if free, else any free staff


class StatusUpdate(BaseModel):
    status: Literal[BookingStatus.completed, BookingStatus.no_show]
