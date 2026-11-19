"""StaffMember model."""

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.booking import Booking
    from app.models.business import Business
    from app.models.calendar_connection import CalendarConnection
    from app.models.service import Service
    from app.models.time_off import TimeOff
    from app.models.user import User
    from app.models.working_hours import WorkingHours


class StaffMember(TimestampMixin, Base):
    __tablename__ = "staff_members"
    __table_args__ = (
        UniqueConstraint("business_id", "email", name="uq_staff_members_business_email"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    display_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    invite_token: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    business: Mapped["Business"] = relationship(back_populates="staff_members")
    user: Mapped["User | None"] = relationship(back_populates="staff_memberships")
    services: Mapped[list["Service"]] = relationship(
        secondary="staff_services", back_populates="staff_members"
    )
    working_hours: Mapped[list["WorkingHours"]] = relationship(
        back_populates="staff",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="(WorkingHours.weekday, WorkingHours.start_time)",
    )
    time_off: Mapped[list["TimeOff"]] = relationship(
        back_populates="staff", cascade="all, delete-orphan", passive_deletes=True
    )
    bookings: Mapped[list["Booking"]] = relationship(back_populates="staff")
    calendar_connections: Mapped[list["CalendarConnection"]] = relationship(back_populates="staff")
