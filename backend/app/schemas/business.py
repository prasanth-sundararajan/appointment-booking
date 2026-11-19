"""Business schemas and the generic paginated envelope."""

import re
from datetime import datetime
from typing import Generic, TypeVar
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.enums import BusinessCategory
from app.schemas.service import ServiceRead
from app.schemas.staff import StaffPublic

_CURRENCY_RE = re.compile(r"^[A-Z]{3}$")


def _validate_timezone(v: str) -> str:
    try:
        ZoneInfo(v)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError("Unknown IANA timezone") from exc
    return v


def _validate_currency(v: str) -> str:
    v = v.upper()
    if not _CURRENCY_RE.match(v):
        raise ValueError("Currency must be a 3-letter ISO 4217 code")
    return v


class _BusinessFields(BaseModel):
    """Shared validators for create/update."""

    @field_validator("timezone", check_fields=False)
    @classmethod
    def _tz(cls, v: str | None) -> str | None:
        return None if v is None else _validate_timezone(v)

    @field_validator("currency", check_fields=False)
    @classmethod
    def _cur(cls, v: str | None) -> str | None:
        return None if v is None else _validate_currency(v)

    @field_validator("name", check_fields=False)
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        return v


class BusinessCreate(_BusinessFields):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    category: BusinessCategory = BusinessCategory.other
    city: str = Field(default="", max_length=120)
    timezone: str = Field(default="UTC", max_length=64)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    # None -> settings defaults (20% / 8h)
    deposit_percent: int | None = Field(default=None, ge=10, le=100)
    cancellation_cutoff_hours: int | None = Field(default=None, ge=0, le=720)
    booking_buffer_minutes: int = Field(default=0, ge=0, le=480)
    min_notice_hours: int = Field(default=1, ge=0, le=720)
    max_advance_days: int = Field(default=60, ge=1, le=365)
    phone: str | None = Field(default=None, max_length=50)
    email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=500)
    logo_url: str | None = Field(default=None, max_length=500, pattern=r"^https?://")


class BusinessUpdate(_BusinessFields):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    category: BusinessCategory | None = None
    city: str | None = Field(default=None, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    deposit_percent: int | None = Field(default=None, ge=10, le=100)
    cancellation_cutoff_hours: int | None = Field(default=None, ge=0, le=720)
    booking_buffer_minutes: int | None = Field(default=None, ge=0, le=480)
    min_notice_hours: int | None = Field(default=None, ge=0, le=720)
    max_advance_days: int | None = Field(default=None, ge=1, le=365)
    phone: str | None = Field(default=None, max_length=50)
    email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=500)
    logo_url: str | None = Field(default=None, max_length=500, pattern=r"^https?://")
    is_active: bool | None = None


# NOT NULL columns: an explicit null in an update is ignored for these.
NON_NULLABLE_UPDATE_FIELDS: frozenset[str] = frozenset(
    {
        "name",
        "category",
        "city",
        "timezone",
        "currency",
        "deposit_percent",
        "cancellation_cutoff_hours",
        "booking_buffer_minutes",
        "min_notice_hours",
        "max_advance_days",
        "is_active",
    }
)


class BusinessRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    name: str
    slug: str
    description: str | None
    category: BusinessCategory
    city: str
    timezone: str
    currency: str
    deposit_percent: int
    cancellation_cutoff_hours: int
    booking_buffer_minutes: int
    min_notice_hours: int
    max_advance_days: int
    phone: str | None
    email: str | None
    address: str | None
    logo_url: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class BusinessPublic(BusinessRead):
    services: list[ServiceRead]
    staff: list[StaffPublic]


T = TypeVar("T")


class Paginated(BaseModel, Generic[T]):  # noqa: UP046  (py3.11 target)
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int
