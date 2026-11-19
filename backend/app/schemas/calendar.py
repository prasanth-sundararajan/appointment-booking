"""Schemas for Google Calendar sync endpoints."""

from datetime import datetime

from pydantic import BaseModel


class CalendarConnectResponse(BaseModel):
    url: str


class CalendarStatusResponse(BaseModel):
    connected: bool
    provider: str = "google"
    calendar_id: str | None = None
    staff_id: int | None = None
    watch_active: bool = False
    watch_expires_at: datetime | None = None
    last_synced_at: datetime | None = None
    busy_block_count: int = 0
    connected_at: datetime | None = None
