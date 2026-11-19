"""User / profile schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import UserRole


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str | None
    role: UserRole
    is_active: bool
    is_verified: bool
    oauth_provider: str | None
    created_at: datetime
    updated_at: datetime


class UserUpdate(BaseModel):
    full_name: str = Field(min_length=1, max_length=150)


class BusinessSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str


class StaffMembership(BaseModel):
    staff_id: int
    business_id: int
    business_name: str
    business_slug: str


class MeResponse(UserRead):
    owned_businesses: list[BusinessSummary]
    staff_memberships: list[StaffMembership]
