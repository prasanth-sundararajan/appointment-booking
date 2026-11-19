"""Service (bookable offering) schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ServiceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    duration_minutes: int = Field(gt=0, le=1440)
    price_minor: int = Field(ge=0)
    is_active: bool = True


class ServiceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    duration_minutes: int | None = Field(default=None, gt=0, le=1440)
    price_minor: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class ServiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    name: str
    description: str | None
    duration_minutes: int
    price_minor: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
