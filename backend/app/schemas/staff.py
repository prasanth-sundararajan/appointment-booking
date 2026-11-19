"""Staff member schemas."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import StaffMember


class StaffInvite(BaseModel):
    display_name: str = Field(min_length=1, max_length=150)
    email: EmailStr
    service_ids: list[int] = Field(default_factory=list)

    @field_validator("email")
    @classmethod
    def _lower_email(cls, v: str) -> str:
        return v.lower()


class StaffUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=150)
    is_active: bool | None = None
    service_ids: list[int] | None = None


class StaffPublic(BaseModel):
    id: int
    business_id: int
    display_name: str
    service_ids: list[int]

    @classmethod
    def from_model(cls, staff: StaffMember) -> "StaffPublic":
        return cls(
            id=staff.id,
            business_id=staff.business_id,
            display_name=staff.display_name,
            service_ids=sorted(s.id for s in staff.services),
        )


class StaffRead(StaffPublic):
    user_id: int | None
    email: str
    is_active: bool
    invite_pending: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, staff: StaffMember) -> "StaffRead":
        return cls(
            id=staff.id,
            business_id=staff.business_id,
            display_name=staff.display_name,
            service_ids=sorted(s.id for s in staff.services),
            user_id=staff.user_id,
            email=staff.email,
            is_active=staff.is_active,
            invite_pending=staff.user_id is None,
            created_at=staff.created_at,
            updated_at=staff.updated_at,
        )


class InviteInfo(BaseModel):
    """Shown on the accept-invite page (GET /api/staff/invites/{token})."""

    business_id: int
    business_name: str
    business_slug: str
    display_name: str
    email: str
