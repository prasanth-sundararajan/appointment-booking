"""CalendarBusyBlock model (cached Google busy intervals).

Events SlotEase itself created (matched by Booking.google_event_id) must be ignored
by the slot engine when blocking slots.
"""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.calendar_connection import CalendarConnection


class CalendarBusyBlock(TimestampMixin, Base):
    __tablename__ = "calendar_busy_blocks"
    __table_args__ = (
        CheckConstraint("end_at > start_at", name="end_after_start"),
        Index("ix_calendar_busy_blocks_conn_start", "connection_id", "start_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    connection_id: Mapped[int] = mapped_column(
        ForeignKey("calendar_connections.id", ondelete="CASCADE"), nullable=False
    )
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    connection: Mapped["CalendarConnection"] = relationship(back_populates="busy_blocks")
