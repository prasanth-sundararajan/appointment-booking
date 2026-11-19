"""User model."""

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin
from app.models.enums import UserRole, pg_enum

if TYPE_CHECKING:
    from app.models.booking import Booking
    from app.models.business import Business
    from app.models.calendar_connection import CalendarConnection
    from app.models.refresh_token import RefreshToken
    from app.models.staff_member import StaffMember


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False, default="")
    role: Mapped[UserRole] = mapped_column(
        pg_enum(UserRole, "user_role"),
        nullable=False,
        default=UserRole.customer,
        server_default=UserRole.customer.value,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    is_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    oauth_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)

    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    businesses: Mapped[list["Business"]] = relationship(back_populates="owner")
    staff_memberships: Mapped[list["StaffMember"]] = relationship(back_populates="user")
    bookings: Mapped[list["Booking"]] = relationship(back_populates="customer")
    calendar_connections: Mapped[list["CalendarConnection"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
