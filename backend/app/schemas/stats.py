"""Dashboard stats schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import BookingStatus


class StatsBooking(BaseModel):
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
    created_at: datetime
    updated_at: datetime


class TopService(BaseModel):
    service_id: int
    name: str
    count: int


class BusinessStats(BaseModel):
    today_bookings: list[StatsBooking]
    upcoming_count: int
    week_count: int
    deposits_collected_minor: int
    currency: str
    top_services: list[TopService]
