"""Business CRUD, slug generation and the public directory search."""

import logging
import math
import re
import secrets
import unicodedata
from collections.abc import Sequence

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.dependencies import get_owned_business
from app.exceptions import ConflictError, NotFoundError
from app.models import Business, BusinessCategory, Service, StaffMember, User, UserRole
from app.schemas.business import (
    NON_NULLABLE_UPDATE_FIELDS,
    BusinessCreate,
    BusinessPublic,
    BusinessRead,
    BusinessUpdate,
)
from app.schemas.service import ServiceRead
from app.schemas.staff import StaffPublic

logger = logging.getLogger(__name__)

MAX_SLUG_BASE = 200
DEFAULT_PAGE_SIZE = 12
MAX_PAGE_SIZE = 50


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")
    return slug[:MAX_SLUG_BASE].strip("-") or "business"


def generate_unique_slug(db: Session, name: str) -> str:
    base = slugify(name)
    taken = set(
        db.scalars(
            select(Business.slug).where(or_(Business.slug == base, Business.slug.like(f"{base}-%")))
        ).all()
    )
    if base not in taken:
        return base
    n = 2
    while f"{base}-{n}" in taken:
        n += 1
    return f"{base}-{n}"


def create_business(db: Session, owner: User, data: BusinessCreate) -> Business:
    values = data.model_dump()
    if values["deposit_percent"] is None:
        values["deposit_percent"] = settings.DEFAULT_DEPOSIT_PERCENT
    if values["cancellation_cutoff_hours"] is None:
        values["cancellation_cutoff_hours"] = settings.DEFAULT_CANCELLATION_CUTOFF_HOURS
    if values.get("email") is not None:
        values["email"] = str(values["email"])

    for attempt in range(3):
        slug = generate_unique_slug(db, data.name)
        if attempt:
            slug = f"{slug}-{secrets.token_hex(3)}"
        business = Business(owner_id=owner.id, slug=slug, **values)
        db.add(business)
        if owner.role == UserRole.customer:
            owner.role = UserRole.owner
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            if "slug" not in str(exc.orig):
                raise
            logger.info("Slug collision on %s, retrying", slug)
            continue
        db.refresh(business)
        logger.info("Business created id=%s owner_id=%s", business.id, owner.id)
        return business
    raise ConflictError("Could not generate a unique slug, try another name")


def update_business(db: Session, user: User, business_id: int, data: BusinessUpdate) -> Business:
    business = get_owned_business(db, user, business_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is None and field in NON_NULLABLE_UPDATE_FIELDS:
            continue
        if field == "email" and value is not None:
            value = str(value)
        setattr(business, field, value)
    db.commit()
    db.refresh(business)
    return business


def deactivate_business(db: Session, user: User, business_id: int) -> None:
    business = get_owned_business(db, user, business_id)
    business.is_active = False
    db.commit()
    logger.info("Business deactivated id=%s", business.id)


def list_owned_businesses(db: Session, user: User) -> Sequence[Business]:
    return db.scalars(
        select(Business).where(Business.owner_id == user.id).order_by(Business.created_at)
    ).all()


def get_public_business(db: Session, slug: str) -> BusinessPublic:
    business = db.scalar(
        select(Business).where(Business.slug == slug, Business.is_active.is_(True))
    )
    if business is None:
        raise NotFoundError("Business not found")
    services = db.scalars(
        select(Service)
        .where(Service.business_id == business.id, Service.is_active.is_(True))
        .order_by(Service.name)
    ).all()
    staff = db.scalars(
        select(StaffMember)
        .options(selectinload(StaffMember.services))
        .where(StaffMember.business_id == business.id, StaffMember.is_active.is_(True))
        .order_by(StaffMember.display_name)
    ).all()
    active_service_ids = {s.id for s in services}
    staff_public = []
    for member in staff:
        item = StaffPublic.from_model(member)
        item.service_ids = [sid for sid in item.service_ids if sid in active_service_ids]
        staff_public.append(item)
    return BusinessPublic(
        **BusinessRead.model_validate(business).model_dump(),
        services=[ServiceRead.model_validate(s) for s in services],
        staff=staff_public,
    )


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def search_businesses(
    db: Session,
    q: str | None,
    category: BusinessCategory | None,
    city: str | None,
    page: int,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> tuple[Sequence[Business], int, int]:
    """Return (items, total, pages) of active businesses."""
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))
    page = max(1, page)
    conditions = [Business.is_active.is_(True)]
    if q and q.strip():
        pattern = f"%{_escape_like(q.strip())}%"
        conditions.append(
            or_(
                Business.name.ilike(pattern, escape="\\"),
                Business.description.ilike(pattern, escape="\\"),
                Business.city.ilike(pattern, escape="\\"),
            )
        )
    if category is not None:
        conditions.append(Business.category == category)
    if city and city.strip():
        conditions.append(Business.city.ilike(_escape_like(city.strip()), escape="\\"))

    total = db.scalar(select(func.count()).select_from(Business).where(*conditions)) or 0
    items = db.scalars(
        select(Business)
        .where(*conditions)
        .order_by(Business.name, Business.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    pages = math.ceil(total / page_size) if total else 0
    return items, total, pages
