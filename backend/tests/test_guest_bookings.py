"""Guest booking for free consultation calls."""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Booking, BookingStatus, User
from tests.conftest import World, at


@pytest.fixture
def free_world(world: World, db: Session, monkeypatch: pytest.MonkeyPatch) -> World:
    world.service.price_minor = 0
    db.commit()
    monkeypatch.setattr(settings, "GUEST_BOOKING_SLUGS", world.business.slug)
    return world


def _payload(w: World, **kw: Any) -> dict[str, Any]:
    body = {
        "service_id": w.service.id,
        "start_at": at(w.day, 10).isoformat(),
        "name": "Asha",
        "email": "asha@example.com",
        "topic": "Build a support agent",
    }
    body.update(kw)
    return body


def _url(w: World) -> str:
    return f"/api/public/businesses/{w.business.slug}/guest-bookings"


def test_guest_books_free_call_without_account(
    client: TestClient, free_world: World, db: Session
) -> None:
    r = client.post(_url(free_world), json=_payload(free_world))
    assert r.status_code == 200, r.text
    booking = db.get(Booking, r.json()["booking_id"])
    assert booking is not None and booking.status == BookingStatus.confirmed
    assert "Build a support agent" in (booking.customer_note or "")
    guest = db.get(User, booking.customer_id)
    assert guest is not None and guest.email == "asha@example.com" and guest.hashed_password is None


def test_same_slot_twice_conflicts(client: TestClient, free_world: World) -> None:
    assert client.post(_url(free_world), json=_payload(free_world)).status_code == 200
    r = client.post(_url(free_world), json=_payload(free_world, email="b@example.com"))
    assert r.status_code == 409


def test_paid_service_refused(client: TestClient, free_world: World, db: Session) -> None:
    free_world.service.price_minor = 50000
    db.commit()
    assert client.post(_url(free_world), json=_payload(free_world)).status_code == 403


def test_business_not_allowed(client: TestClient, world: World) -> None:
    world.service.price_minor = 0
    assert client.post(_url(world), json=_payload(world)).status_code == 403


def test_honeypot_creates_nothing(client: TestClient, free_world: World, db: Session) -> None:
    r = client.post(_url(free_world), json=_payload(free_world, website="spam"))
    assert r.status_code == 200 and r.json()["booking_id"] is None
    assert db.query(Booking).count() == 0


def test_undeliverable_email_rejected(
    client: TestClient, free_world: World, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.routers.guest_bookings as guest_router
    from app.exceptions import ValidationAppError

    def reject(email: str) -> None:
        raise ValidationAppError("We couldn't verify that email address.")

    monkeypatch.setattr(guest_router, "ensure_deliverable", reject)
    r = client.post(_url(free_world), json=_payload(free_world, email="typo@gmial.con"))
    assert r.status_code == 422
