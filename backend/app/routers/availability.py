"""Working hours + time off endpoints. (The public /slots endpoint lives in the slots router.)"""

from collections.abc import Sequence

from fastapi import APIRouter, Body, Depends, Query, status
from pydantic import AwareDatetime
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import TimeOff, User, WorkingHours
from app.schemas.availability import (
    TimeOffCreate,
    TimeOffRead,
    WorkingHoursIn,
    WorkingHoursRead,
)
from app.services import availability_service

router = APIRouter(prefix="/api", tags=["availability"])


@router.get("/staff/{staff_id}/hours", response_model=list[WorkingHoursRead])
async def get_hours(
    staff_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Sequence[WorkingHours]:
    return availability_service.get_hours(db, user, staff_id)


@router.put("/staff/{staff_id}/hours", response_model=list[WorkingHoursRead])
async def replace_hours(
    staff_id: int,
    hours: list[WorkingHoursIn] = Body(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Sequence[WorkingHours]:
    """Body: JSON array of {weekday, start_time, end_time}; replaces the whole week."""
    return availability_service.replace_hours(db, user, staff_id, hours)


@router.get("/staff/{staff_id}/time-off", response_model=list[TimeOffRead])
async def list_time_off(
    staff_id: int,
    since: AwareDatetime | None = Query(default=None, alias="from"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Sequence[TimeOff]:
    return availability_service.list_time_off(db, user, staff_id, since)


@router.post(
    "/staff/{staff_id}/time-off",
    response_model=TimeOffRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_time_off(
    staff_id: int,
    data: TimeOffCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TimeOff:
    return availability_service.add_time_off(db, user, staff_id, data)


@router.delete("/time-off/{time_off_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_time_off(
    time_off_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    availability_service.delete_time_off(db, user, time_off_id)
