"""CalendarConnection model (Google Calendar link; tokens are Fernet-encrypted)."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.calendar_busy_block import CalendarBusyBlock
    from app.models.staff_member import StaffMember
    from app.models.user import User


class CalendarConnection(TimestampMixin, Base):
    __tablename__ = "calendar_connections"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    staff_id: Mapped[int | None] = mapped_column(
        ForeignKey("staff_members.id", ondelete="SET NULL"), index=True, nullable=True
    )
    google_calendar_id: Mapped[str] = mapped_column(String(255), nullable=False, default="primary")
    access_token_enc: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    watch_channel_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    watch_resource_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    watch_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped["User"] = relationship(back_populates="calendar_connections")
    staff: Mapped["StaffMember | None"] = relationship(back_populates="calendar_connections")
    busy_blocks: Mapped[list["CalendarBusyBlock"]] = relationship(
        back_populates="connection", cascade="all, delete-orphan", passive_deletes=True
    )
