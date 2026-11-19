"""Services CRUD and staff invite / accept / update / remove."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import StaffMember, User, UserRole
from app.services import email as email_service
from tests.conftest import World, auth


def test_service_crud(client: TestClient, world: World) -> None:
    h = auth(world.owner)
    bid = world.business.id
    created = client.post(
        f"/api/businesses/{bid}/services",
        json={"name": "Beard Trim", "duration_minutes": 30, "price_minor": 5000},
        headers=h,
    )
    assert created.status_code == 201
    sid = created.json()["id"]

    bad = client.post(
        f"/api/businesses/{bid}/services",
        json={"name": "x", "duration_minutes": 0, "price_minor": 1},
        headers=h,
    )
    assert bad.status_code == 422

    upd = client.put(
        f"/api/services/{sid}", json={"price_minor": 6000, "description": None}, headers=h
    )
    assert upd.status_code == 200 and upd.json()["price_minor"] == 6000

    public = [s["name"] for s in client.get(f"/api/businesses/{bid}/services").json()]
    assert public == ["Beard Trim", "Haircut"]

    assert client.delete(f"/api/services/{sid}", headers=h).status_code == 204
    public = [s["name"] for s in client.get(f"/api/businesses/{bid}/services").json()]
    assert public == ["Haircut"]
    everything = client.get(f"/api/businesses/{bid}/services/all", headers=h).json()
    assert len(everything) == 2

    assert client.put("/api/services/99999", json={}, headers=h).status_code == 404
    assert client.get("/api/businesses/99999/services").status_code == 404


@pytest.fixture
def invites(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str, str]]:
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        email_service, "send_staff_invite", lambda to, name, url: sent.append((to, name, url))
    )
    return sent


def _invite(client: TestClient, world: World, email: str, **kw: Any) -> Any:
    return client.post(
        f"/api/businesses/{world.business.id}/staff",
        json={"display_name": "Sam", "email": email, **kw},
        headers=auth(world.owner),
    )


def test_invite_and_accept(
    client: TestClient,
    world: World,
    db: Session,
    make_user: Callable[..., User],
    invites: list[tuple[str, str, str]],
) -> None:
    resp = _invite(client, world, "Sam@Example.com", service_ids=[world.service.id])
    assert resp.status_code == 201
    body = resp.json()
    assert body["invite_pending"] is True and body["email"] == "sam@example.com"
    assert body["service_ids"] == [world.service.id]

    assert len(invites) == 1
    to, business_name, url = invites[0]
    assert to == "sam@example.com" and business_name == "Glow Salon"
    token = url.rsplit("/", 1)[1]

    info = client.get(f"/api/staff/invites/{token}")
    assert info.status_code == 200 and info.json()["business_slug"] == world.business.slug

    # Token is stored hashed, never raw.
    staff = db.get(StaffMember, body["id"])
    assert staff is not None and staff.invite_token != token

    stranger = make_user(email="other@example.com")
    wrong = client.post(f"/api/staff/invites/{token}/accept", headers=auth(stranger))
    assert wrong.status_code == 403

    sam = make_user(email="sam@example.com")
    ok = client.post(f"/api/staff/invites/{token}/accept", headers=auth(sam))
    assert ok.status_code == 200
    assert ok.json()["user_id"] == sam.id and ok.json()["invite_pending"] is False
    db.refresh(sam)
    assert sam.role == UserRole.staff

    again = client.post(f"/api/staff/invites/{token}/accept", headers=auth(sam))
    assert again.status_code == 404
    assert client.get(f"/api/staff/invites/{token}").status_code == 404

    me = client.get("/auth/me", headers=auth(sam)).json()
    assert me["staff_memberships"][0]["business_id"] == world.business.id


def test_invite_validation(
    client: TestClient,
    world: World,
    make_business: Callable[..., Any],
    make_service: Callable[..., Any],
    invites: list[tuple[str, str, str]],
) -> None:
    assert _invite(client, world, "dup@example.com").status_code == 201
    dup = _invite(client, world, "DUP@example.com")
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "STAFF_EXISTS"

    foreign = make_service(make_business())
    resp = _invite(client, world, "x@example.com", service_ids=[foreign.id])
    assert resp.status_code == 422

    assert client.get("/api/staff/invites/short").status_code == 422
    assert client.get(f"/api/staff/invites/{'z' * 40}").status_code == 404


def test_update_and_list_staff(
    client: TestClient, world: World, make_service: Callable[..., Any]
) -> None:
    h = auth(world.owner)
    other = make_service(world.business, name="Color")
    resp = client.put(
        f"/api/staff/{world.staff.id}",
        json={"display_name": " Alexis ", "service_ids": [other.id, world.service.id]},
        headers=h,
    )
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "Alexis"
    assert resp.json()["service_ids"] == sorted([other.id, world.service.id])

    client.put(f"/api/staff/{world.staff.id}", json={"is_active": False}, headers=h)
    assert client.get(f"/api/businesses/{world.business.id}/staff").json() == []
    all_staff = client.get(f"/api/businesses/{world.business.id}/staff/all", headers=h).json()
    assert all_staff[0]["is_active"] is False


def test_remove_staff(
    client: TestClient,
    world: World,
    db: Session,
    make_staff: Callable[..., StaffMember],
    make_booking: Callable[..., Any],
) -> None:
    h = auth(world.owner)
    # Upcoming booking blocks removal.
    make_booking(world.service, world.staff, world.customer, datetime.now(UTC) + timedelta(days=1))
    resp = client.delete(f"/api/staff/{world.staff.id}", headers=h)
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "STAFF_HAS_BOOKINGS"

    # Past booking only -> soft delete.
    veteran = make_staff(world.business, [world.service], name="Vet")
    make_booking(world.service, veteran, world.customer, datetime.now(UTC) - timedelta(days=3))
    assert client.delete(f"/api/staff/{veteran.id}", headers=h).status_code == 204
    db.refresh(veteran)
    assert veteran.is_active is False

    # No history -> hard delete.
    fresh = make_staff(world.business, [world.service], name="Fresh")
    fresh_id = fresh.id
    assert client.delete(f"/api/staff/{fresh_id}", headers=h).status_code == 204
    db.expire_all()
    assert db.get(StaffMember, fresh_id) is None
    assert client.delete("/api/staff/99999", headers=h).status_code == 404
