"""Staff endpoints, including invite lookup/acceptance."""

from fastapi import APIRouter, BackgroundTasks, Depends, Path, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app.schemas.staff import InviteInfo, StaffInvite, StaffPublic, StaffRead, StaffUpdate
from app.services import staff_service

router = APIRouter(prefix="/api", tags=["staff"])

InviteToken = Path(min_length=16, max_length=128)


@router.get("/businesses/{business_id}/staff", response_model=list[StaffPublic])
async def list_staff(business_id: int, db: Session = Depends(get_db)) -> list[StaffPublic]:
    """Public: active staff (no emails)."""
    return [StaffPublic.from_model(s) for s in staff_service.list_public_staff(db, business_id)]


@router.get("/businesses/{business_id}/staff/all", response_model=list[StaffRead])
async def list_all_staff(
    business_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[StaffRead]:
    """Owner: all staff incl. inactive and pending invites."""
    return [StaffRead.from_model(s) for s in staff_service.list_all_staff(db, user, business_id)]


@router.post(
    "/businesses/{business_id}/staff",
    response_model=StaffRead,
    status_code=status.HTTP_201_CREATED,
)
async def invite_staff(
    business_id: int,
    data: StaffInvite,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StaffRead:
    staff = staff_service.invite_staff(db, user, business_id, data, background_tasks)
    return StaffRead.from_model(staff)


@router.get("/staff/invites/{token}", response_model=InviteInfo)
async def get_invite(token: str = InviteToken, db: Session = Depends(get_db)) -> InviteInfo:
    return staff_service.get_invite_info(db, token)


@router.post("/staff/invites/{token}/accept", response_model=StaffRead)
async def accept_invite(
    token: str = InviteToken,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StaffRead:
    return StaffRead.from_model(staff_service.accept_invite(db, user, token))


@router.put("/staff/{staff_id}", response_model=StaffRead)
async def update_staff(
    staff_id: int,
    data: StaffUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StaffRead:
    return StaffRead.from_model(staff_service.update_staff(db, user, staff_id, data))


@router.delete("/staff/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_staff(
    staff_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    staff_service.remove_staff(db, user, staff_id)
