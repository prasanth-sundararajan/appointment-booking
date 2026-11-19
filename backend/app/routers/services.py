"""Service endpoints."""

from collections.abc import Sequence

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Service, User
from app.schemas.service import ServiceCreate, ServiceRead, ServiceUpdate
from app.services import service_service

router = APIRouter(prefix="/api", tags=["services"])


@router.get("/businesses/{business_id}/services", response_model=list[ServiceRead])
async def list_services(business_id: int, db: Session = Depends(get_db)) -> Sequence[Service]:
    """Public: active services of an active business."""
    return service_service.list_public_services(db, business_id)


@router.get("/businesses/{business_id}/services/all", response_model=list[ServiceRead])
async def list_all_services(
    business_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Sequence[Service]:
    """Owner: all services including inactive ones."""
    return service_service.list_all_services(db, user, business_id)


@router.post(
    "/businesses/{business_id}/services",
    response_model=ServiceRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_service(
    business_id: int,
    data: ServiceCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Service:
    return service_service.create_service(db, user, business_id, data)


@router.put("/services/{service_id}", response_model=ServiceRead)
async def update_service(
    service_id: int,
    data: ServiceUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Service:
    return service_service.update_service(db, user, service_id, data)


@router.delete("/services/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_service(
    service_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    service_service.delete_service(db, user, service_id)
