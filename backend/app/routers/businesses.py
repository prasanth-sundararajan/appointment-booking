"""Business endpoints, directory search, /api/me/businesses and dashboard stats."""

from collections.abc import Sequence

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, get_owned_business
from app.models import Business, BusinessCategory, User
from app.schemas.business import (
    BusinessCreate,
    BusinessPublic,
    BusinessRead,
    BusinessUpdate,
    Paginated,
)
from app.schemas.stats import BusinessStats
from app.services import business_service, stats_service

router = APIRouter(prefix="/api", tags=["businesses"])


@router.get("/businesses", response_model=Paginated[BusinessRead])
async def search_businesses(
    q: str | None = Query(default=None, max_length=100),
    category: BusinessCategory | None = None,
    city: str | None = Query(default=None, max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=business_service.DEFAULT_PAGE_SIZE, ge=1, le=50),
    db: Session = Depends(get_db),
) -> Paginated[BusinessRead]:
    items, total, pages = business_service.search_businesses(db, q, category, city, page, page_size)
    return Paginated[BusinessRead](
        items=[BusinessRead.model_validate(b) for b in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.post("/businesses", response_model=BusinessRead, status_code=status.HTTP_201_CREATED)
async def create_business(
    data: BusinessCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Business:
    return business_service.create_business(db, user, data)


@router.get("/businesses/{slug}", response_model=BusinessPublic)
async def get_business_by_slug(slug: str, db: Session = Depends(get_db)) -> BusinessPublic:
    return business_service.get_public_business(db, slug)


@router.put("/businesses/{business_id}", response_model=BusinessRead)
async def update_business(
    business_id: int,
    data: BusinessUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Business:
    return business_service.update_business(db, user, business_id, data)


@router.delete("/businesses/{business_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_business(
    business_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    business_service.deactivate_business(db, user, business_id)


@router.get("/businesses/{business_id}/stats", response_model=BusinessStats)
async def business_stats(
    business_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BusinessStats:
    return stats_service.get_business_stats(db, user, business_id)


@router.get("/me/businesses", response_model=list[BusinessRead])
async def my_businesses(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Sequence[Business]:
    return business_service.list_owned_businesses(db, user)


@router.get("/me/businesses/{business_id}", response_model=BusinessRead)
async def my_business(
    business_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Business:
    """Owner view by id (includes inactive businesses), for the settings page."""
    return get_owned_business(db, user, business_id)
