"""Enum types shared by models and schemas."""

import enum

from sqlalchemy import Enum as SAEnum


class UserRole(str, enum.Enum):
    customer = "customer"
    owner = "owner"
    staff = "staff"


class BusinessCategory(str, enum.Enum):
    salon = "salon"
    clinic = "clinic"
    fitness = "fitness"
    consulting = "consulting"
    education = "education"
    other = "other"


class BookingStatus(str, enum.Enum):
    pending_payment = "pending_payment"
    confirmed = "confirmed"
    cancelled = "cancelled"
    completed = "completed"
    no_show = "no_show"
    expired = "expired"


class CancelledBy(str, enum.Enum):
    customer = "customer"
    business = "business"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    succeeded = "succeeded"
    failed = "failed"
    refund_pending = "refund_pending"  # refund requested, awaiting provider/webhook
    refunded = "refunded"


def pg_enum(enum_cls: type[enum.Enum], name: str) -> SAEnum:
    """Native PG enum storing the enum *values* (lowercase strings)."""
    return SAEnum(
        enum_cls,
        name=name,
        values_callable=lambda e: [m.value for m in e],
        validate_strings=True,
    )
