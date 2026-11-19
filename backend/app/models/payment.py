"""Payment model (deposit for a booking)."""

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin
from app.models.enums import PaymentStatus, pg_enum

if TYPE_CHECKING:
    from app.models.booking import Booking
    from app.models.business import Business


class Payment(TimestampMixin, Base):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("amount_minor >= 0", name="amount_nonneg"),
        CheckConstraint("refunded_amount_minor >= 0", name="refunded_nonneg"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    business_id: Mapped[int] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), index=True, nullable=False
    )
    provider: Mapped[str] = mapped_column(
        String(32), nullable=False, default="dodo", server_default="dodo"
    )
    provider_payment_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    checkout_session_id: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(
        pg_enum(PaymentStatus, "payment_status"),
        nullable=False,
        default=PaymentStatus.pending,
        server_default=PaymentStatus.pending.value,
    )
    refund_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    refunded_amount_minor: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    # Set when the provider reports refund.failed (status goes back to succeeded); shown to
    # the owner so the refund can be handled manually. Cleared on the next refund request.
    refund_failed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    booking: Mapped["Booking"] = relationship(back_populates="payment")
    business: Mapped["Business"] = relationship(back_populates="payments")
