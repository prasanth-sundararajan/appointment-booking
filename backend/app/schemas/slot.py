"""Slot schemas."""

from datetime import date, datetime

from pydantic import BaseModel


class SlotOut(BaseModel):
    start_at: datetime
    end_at: datetime
    staff_ids: list[int]


class SlotsResponse(BaseModel):
    business_id: int
    service_id: int
    staff_id: int | None
    date: date
    timezone: str
    slots: list[SlotOut]
