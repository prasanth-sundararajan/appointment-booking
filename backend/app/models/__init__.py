"""SlotEase ORM models. Importing this package registers every table on Base.metadata."""

from app.database import Base
from app.models.base import TimestampMixin
from app.models.booking import ACTIVE_BOOKING_STATUSES, BOOKING_NO_OVERLAP_CONSTRAINT, Booking
from app.models.business import Business
from app.models.calendar_busy_block import CalendarBusyBlock
from app.models.calendar_connection import CalendarConnection
from app.models.enums import BookingStatus, BusinessCategory, CancelledBy, PaymentStatus, UserRole
from app.models.payment import Payment
from app.models.refresh_token import RefreshToken
from app.models.service import Service
from app.models.staff_member import StaffMember
from app.models.staff_service import StaffService
from app.models.time_off import TimeOff
from app.models.user import User
from app.models.webhook_event import WebhookEvent
from app.models.working_hours import WorkingHours

__all__ = [
    "ACTIVE_BOOKING_STATUSES",
    "BOOKING_NO_OVERLAP_CONSTRAINT",
    "Base",
    "Booking",
    "BookingStatus",
    "Business",
    "BusinessCategory",
    "CalendarBusyBlock",
    "CalendarConnection",
    "CancelledBy",
    "Payment",
    "PaymentStatus",
    "RefreshToken",
    "Service",
    "StaffMember",
    "StaffService",
    "TimeOff",
    "TimestampMixin",
    "User",
    "UserRole",
    "WebhookEvent",
    "WorkingHours",
]
