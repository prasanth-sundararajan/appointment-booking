"""Service (bookable offering) CRUD, tenant-scoped to the owning business."""

import logging
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import get_owned_business
from app.exceptions import NotFoundError
from app.models import Business, Service, User
from app.schemas.service import ServiceCreate, ServiceUpdate

logger = logging.getLogger(__name__)


def list_public_services(db: Session, business_id: int) -> Sequence[Service]:
    business = db.get(Business, business_id)
    if business is None or not business.is_active:
        raise NotFoundError("Business not found")
    return db.scalars(
        select(Service)
        .where(Service.business_id == business_id, Service.is_active.is_(True))
        .order_by(Service.name)
    ).all()


def list_all_services(db: Session, user: User, business_id: int) -> Sequence[Service]:
    get_owned_business(db, user, business_id)
    return db.scalars(
        select(Service).where(Service.business_id == business_id).order_by(Service.name)
    ).all()


def create_service(db: Session, user: User, business_id: int, data: ServiceCreate) -> Service:
    get_owned_business(db, user, business_id)
    service = Service(business_id=business_id, **data.model_dump())
    db.add(service)
    db.commit()
    db.refresh(service)
    logger.info("Service created id=%s business_id=%s", service.id, business_id)
    return service


def _get_owned_service(db: Session, user: User, service_id: int) -> Service:
    service = db.get(Service, service_id)
    if service is None:
        raise NotFoundError("Service not found")
    get_owned_business(db, user, service.business_id)
    return service


def update_service(db: Session, user: User, service_id: int, data: ServiceUpdate) -> Service:
    service = _get_owned_service(db, user, service_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        if value is None and field != "description":
            continue
        setattr(service, field, value)
    db.commit()
    db.refresh(service)
    return service


def delete_service(db: Session, user: User, service_id: int) -> None:
    """Soft delete: existing bookings keep referencing the service."""
    service = _get_owned_service(db, user, service_id)
    service.is_active = False
    db.commit()
    logger.info("Service deactivated id=%s", service.id)
