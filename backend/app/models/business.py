"""Business model."""

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin
from app.models.enums import BusinessCategory, pg_enum

if TYPE_CHECKING:
    from app.models.booking import Booking
    from app.models.payment import Payment
    from app.models.service import Service
    from app.models.staff_member import StaffMember
    from app.models.user import User


class Business(TimestampMixin, Base):
    __tablename__ = "businesses"
    __table_args__ = (
        CheckConstraint("deposit_percent BETWEEN 10 AND 100", name="deposit_percent_range"),
        CheckConstraint("cancellation_cutoff_hours >= 0", name="cancellation_cutoff_nonneg"),
        CheckConstraint("booking_buffer_minutes >= 0", name="buffer_nonneg"),
        CheckConstraint("min_notice_hours >= 0", name="min_notice_nonneg"),
        CheckConstraint("max_advance_days > 0", name="max_advance_positive"),
        Index("ix_businesses_category_city", "category", "city"),
        Index(
            "ix_businesses_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(220), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[BusinessCategory] = mapped_column(
        pg_enum(BusinessCategory, "business_category"),
        nullable=False,
        default=BusinessCategory.other,
        server_default=BusinessCategory.other.value,
    )
    city: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")  # IANA
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")  # ISO 4217

    deposit_percent: Mapped[int] = mapped_column(
        Integer, nullable=False, default=20, server_default="20"
    )
    cancellation_cutoff_hours: Mapped[int] = mapped_column(
        Integer, nullable=False, default=8, server_default="8"
    )
    booking_buffer_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    min_notice_hours: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    max_advance_days: Mapped[int] = mapped_column(
        Integer, nullable=False, default=60, server_default="60"
    )

    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    owner: Mapped["User"] = relationship(back_populates="businesses")
    services: Mapped[list["Service"]] = relationship(
        back_populates="business", cascade="all, delete-orphan", passive_deletes=True
    )
    staff_members: Mapped[list["StaffMember"]] = relationship(
        back_populates="business", cascade="all, delete-orphan", passive_deletes=True
    )
    bookings: Mapped[list["Booking"]] = relationship(
        back_populates="business", passive_deletes=True
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="business", passive_deletes=True
    )
