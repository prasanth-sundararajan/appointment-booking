"""Tenant isolation: the owner of business A cannot touch business B's resources."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.models import Booking, Business, Service, StaffMember, TimeOff, User, UserRole
from tests.conftest import World, auth


@pytest.fixture
def intruder(make_user: Callable[..., User], make_business: Callable[..., Business]) -> User:
    owner_a = make_user(role=UserRole.owner)
    make_business(owner=owner_a, name="Business A")
    return owner_a


@pytest.fixture
def b_resources(world: World, make_booking: Callable[..., Booking], db: Any) -> dict[str, Any]:
    booking = make_booking(
        world.service, world.staff, world.customer, datetime.now(UTC) + timedelta(days=2)
    )
    time_off = TimeOff(
        staff_id=world.staff.id,
        start_at=datetime.now(UTC) + timedelta(days=5),
        end_at=datetime.now(UTC) + timedelta(days=6),
    )
    db.add(time_off)
    db.commit()
    return {"booking": booking, "time_off": time_off}


def _requests(
    w: World, booking: Booking, time_off: TimeOff
) -> list[tuple[str, str, dict[str, Any] | list[Any] | None]]:
    bid, sid, stid = w.business.id, w.service.id, w.staff.id
    return [
        ("PUT", f"/api/businesses/{bid}", {"deposit_percent": 50}),
        ("DELETE", f"/api/businesses/{bid}", None),
        ("GET", f"/api/me/businesses/{bid}", None),
        ("GET", f"/api/businesses/{bid}/stats", None),
        ("GET", f"/api/businesses/{bid}/services/all", None),
        (
            "POST",
            f"/api/businesses/{bid}/services",
            {"name": "x", "duration_minutes": 30, "price_minor": 1},
        ),
        ("PUT", f"/api/services/{sid}", {"price_minor": 1}),
        ("DELETE", f"/api/services/{sid}", None),
        ("GET", f"/api/businesses/{bid}/staff/all", None),
        ("POST", f"/api/businesses/{bid}/staff", {"display_name": "x", "email": "x@x.com"}),
        ("PUT", f"/api/staff/{stid}", {"display_name": "hacked"}),
        ("DELETE", f"/api/staff/{stid}", None),
        ("GET", f"/api/staff/{stid}/hours", None),
        ("PUT", f"/api/staff/{stid}/hours", []),
        ("GET", f"/api/staff/{stid}/time-off", None),
        (
            "POST",
            f"/api/staff/{stid}/time-off",
            {"start_at": "2031-01-01T00:00:00Z", "end_at": "2031-01-02T00:00:00Z"},
        ),
        ("DELETE", f"/api/time-off/{time_off.id}", None),
        ("GET", f"/api/businesses/{bid}/bookings", None),
        ("GET", f"/api/businesses/{bid}/payments", None),
        ("GET", f"/api/bookings/{booking.id}", None),
        ("GET", f"/api/bookings/{booking.id}/cancel-preview", None),
        ("POST", f"/api/bookings/{booking.id}/cancel", None),
        ("POST", f"/api/bookings/{booking.id}/reschedule", {"start_at": "2031-01-01T10:00:00Z"}),
        ("PATCH", f"/api/bookings/{booking.id}/status", {"status": "completed"}),
    ]


def test_owner_a_cannot_access_business_b(
    client: TestClient, world: World, intruder: User, b_resources: dict[str, Any], db: Any
) -> None:
    headers = auth(intruder)
    failures = []
    for method, url, body in _requests(world, b_resources["booking"], b_resources["time_off"]):
        resp = client.request(method, url, json=body, headers=headers)
        if resp.status_code not in (403, 404):
            failures.append((method, url, resp.status_code))
    assert failures == []

    # Nothing changed.
    db.expire_all()
    business = db.get(Business, world.business.id)
    assert business.deposit_percent == 20 and business.is_active
    assert db.get(Service, world.service.id).is_active
    assert db.get(StaffMember, world.staff.id).display_name == "Alex"
    assert db.get(TimeOff, b_resources["time_off"].id) is not None
    assert db.get(Booking, b_resources["booking"].id).status.value == "confirmed"


def test_owner_lists_only_own_businesses(client: TestClient, world: World, intruder: User) -> None:
    mine = client.get("/api/me/businesses", headers=auth(intruder)).json()
    assert [b["name"] for b in mine] == ["Business A"]
    theirs = client.get("/api/me/businesses", headers=auth(world.owner)).json()
    assert [b["name"] for b in theirs] == ["Glow Salon"]


def test_staff_of_a_cannot_reach_b(
    client: TestClient,
    world: World,
    make_user: Callable[..., User],
    make_business: Callable[..., Business],
    make_staff: Callable[..., StaffMember],
) -> None:
    staff_user = make_user()
    other = make_business(name="Other Place")
    make_staff(other, [], user=staff_user)
    headers = auth(staff_user)
    for url in (
        f"/api/businesses/{world.business.id}/bookings",
        f"/api/businesses/{world.business.id}/stats",
        f"/api/staff/{world.staff.id}/hours",
    ):
        assert client.get(url, headers=headers).status_code == 403


def test_missing_ids_are_404(client: TestClient, intruder: User) -> None:
    headers = auth(intruder)
    assert client.put("/api/businesses/99999", json={}, headers=headers).status_code == 404
    assert client.get("/api/businesses/99999/bookings", headers=headers).status_code == 404
