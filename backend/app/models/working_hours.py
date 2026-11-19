"""WorkingHours model (weekly recurring availability in business-local time)."""

from datetime import time
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, SmallInteger, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.staff_member import StaffMember


class WorkingHours(TimestampMixin, Base):
    __tablename__ = "working_hours"
    __table_args__ = (
        CheckConstraint("weekday BETWEEN 0 AND 6", name="weekday_range"),
        CheckConstraint("end_time > start_time", name="end_after_start"),
        Index("ix_working_hours_staff_weekday", "staff_id", "weekday"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    staff_id: Mapped[int] = mapped_column(
        ForeignKey("staff_members.id", ondelete="CASCADE"), nullable=False
    )
    weekday: Mapped[int] = mapped_column(
        SmallInteger, nullable=False
    )  # 0 = Monday (Python weekday())
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    staff: Mapped["StaffMember"] = relationship(back_populates="working_hours")
