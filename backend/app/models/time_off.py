"""TimeOff model."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.staff_member import StaffMember


class TimeOff(TimestampMixin, Base):
    __tablename__ = "time_off"
    __table_args__ = (
        CheckConstraint("end_at > start_at", name="end_after_start"),
        Index("ix_time_off_staff_start", "staff_id", "start_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    staff_id: Mapped[int] = mapped_column(
        ForeignKey("staff_members.id", ondelete="CASCADE"), nullable=False
    )
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    staff: Mapped["StaffMember"] = relationship(back_populates="time_off")
