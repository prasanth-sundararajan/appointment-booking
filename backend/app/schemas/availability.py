"""Working hours and time-off schemas (slot schemas live with the slot engine)."""

from datetime import datetime, time

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class WorkingHoursIn(BaseModel):
    weekday: int = Field(ge=0, le=6, description="0 = Monday ... 6 = Sunday")
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def _order(self) -> "WorkingHoursIn":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class WorkingHoursRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    staff_id: int
    weekday: int
    start_time: time
    end_time: time
    created_at: datetime
    updated_at: datetime


class TimeOffCreate(BaseModel):
    start_at: AwareDatetime
    end_at: AwareDatetime
    reason: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _order(self) -> "TimeOffCreate":
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be after start_at")
        return self


class TimeOffRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    staff_id: int
    start_at: datetime
    end_at: datetime
    reason: str | None
    created_at: datetime
    updated_at: datetime
