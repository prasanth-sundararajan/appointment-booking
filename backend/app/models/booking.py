"""Booking model with DB-level double-booking prevention."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    column,
    func,
    literal_column,
    text,
)
from sqlalchemy.dialects.postgresql import ExcludeConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin
from app.models.enums import BookingStatus, CancelledBy, pg_enum

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.payment import Payment
    from app.models.service import Service
    from app.models.staff_member import StaffMember
    from app.models.user import User

# Statuses that occupy a slot. Keep in sync with the exclusion constraint WHERE clause.
ACTIVE_BOOKING_STATUSES: tuple[BookingStatus, ...] = (
    BookingStatus.pending_payment,
    BookingStatus.confirmed,
)
# Catch IntegrityError whose message/diag constraint_name is this, and return 409.
BOOKING_NO_OVERLAP_CONSTRAINT = "ex_bookings_staff_no_overlap"


class Booking(TimestampMixin, Base):
    __tablename__ = "bookings"
    __table_args__ = (
        CheckConstraint("end_at > start_at", name="end_after_start"),
        ExcludeConstraint(
            (column("staff_id"), "="),
            (
                func.tstzrange(column("start_at"), column("end_at"), literal_column("'[)'")),
                "&&",
            ),
            name=BOOKING_NO_OVERLAP_CONSTRAINT,
            using="gist",
            where=text("status IN ('pending_payment', 'confirmed')"),
        ),
        Index("ix_bookings_business_start", "business_id", "start_at"),
        Index("ix_bookings_customer_start", "customer_id", "start_at"),
        Index("ix_bookings_status_hold", "status", "hold_expires_at"),
        Index("ix_bookings_staff_start", "staff_id", "start_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    service_id: Mapped[int] = mapped_column(
        ForeignKey("services.id", ondelete="RESTRICT"), nullable=False
    )
    staff_id: Mapped[int] = mapped_column(
        ForeignKey("staff_members.id", ondelete="RESTRICT"), nullable=False
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[BookingStatus] = mapped_column(
        pg_enum(BookingStatus, "booking_status"),
        nullable=False,
        default=BookingStatus.pending_payment,
        server_default=BookingStatus.pending_payment.value,
    )
    hold_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    customer_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelled_by: Mapped[CancelledBy | None] = mapped_column(
        pg_enum(CancelledBy, "cancelled_by"), nullable=True
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    google_event_id: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)

    business: Mapped["Business"] = relationship(back_populates="bookings")
    service: Mapped["Service"] = relationship(back_populates="bookings")
    staff: Mapped["StaffMember"] = relationship(back_populates="bookings")
    customer: Mapped["User"] = relationship(back_populates="bookings")
    payment: Mapped["Payment | None"] = relationship(back_populates="booking", uselist=False)
