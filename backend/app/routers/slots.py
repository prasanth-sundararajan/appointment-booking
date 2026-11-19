"""Public open-slot lookup (PRP Module 4). Include with no prefix."""

from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, Query
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.exceptions import NotFoundError
from app.models import Business, Service, StaffMember
from app.schemas.slot import SlotOut, SlotsResponse
from app.services.slot_engine import get_open_slots

router = APIRouter(tags=["slots"])


def _load_slots(
    db: Session, business_id: int, service_id: int, day: date, staff_id: int | None
) -> SlotsResponse:
    business = db.get(Business, business_id)
    if business is None or not business.is_active:
        raise NotFoundError("Business not found")
    service = db.get(Service, service_id)
    if service is None or service.business_id != business.id or not service.is_active:
        raise NotFoundError("Service not found")
    if staff_id is not None:
        staff = db.get(StaffMember, staff_id)
        if staff is None or staff.business_id != business.id or not staff.is_active:
            raise NotFoundError("Staff member not found")
    slots = get_open_slots(db, business, service, day, staff_id, datetime.now(UTC))
    return SlotsResponse(
        business_id=business.id,
        service_id=service.id,
        staff_id=staff_id,
        date=day,
        timezone=business.timezone,
        slots=[SlotOut(**s) for s in slots],
    )


@router.get("/api/businesses/{business_id}/slots", response_model=SlotsResponse)
async def list_open_slots(
    business_id: int,
    service_id: int = Query(..., gt=0),
    day: date = Query(..., alias="date", description="Business-local date (YYYY-MM-DD)"),
    staff_id: int | None = Query(None, gt=0),
    db: Session = Depends(get_db),
) -> SlotsResponse:
    return await run_in_threadpool(_load_slots, db, business_id, service_id, day, staff_id)
