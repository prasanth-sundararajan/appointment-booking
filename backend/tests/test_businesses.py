"""Businesses: create defaults, deposit validation, slugs, directory search, public page."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import BookingStatus, Business, BusinessCategory, User, UserRole
from app.services.business_service import slugify
from app.services.deposit import calc_deposit, currency_exponent, format_money
from tests.conftest import World, auth


def _create(client: TestClient, user: User, **kw: Any) -> Any:
    payload: dict[str, Any] = {"name": "My Salon", "city": "Pune", **kw}
    return client.post("/api/businesses", json=payload, headers=auth(user))


def test_create_business_defaults_and_role_upgrade(
    client: TestClient, db: Session, make_user: Callable[..., User]
) -> None:
    user = make_user()
    resp = _create(client, user)
    assert resp.status_code == 201
    body = resp.json()
    assert body["deposit_percent"] == 15
    assert body["cancellation_cutoff_hours"] == 8
    assert body["slug"] == "my-salon"
    assert body["currency"] == "INR" and body["timezone"] == "UTC"
    db.refresh(user)
    assert user.role == UserRole.owner


def test_create_requires_auth(client: TestClient) -> None:
    assert client.post("/api/businesses", json={"name": "x"}).status_code == 401


@pytest.mark.parametrize("percent,status", [(9, 422), (10, 201), (55, 201), (100, 201), (101, 422)])
def test_deposit_percent_range_on_create(
    client: TestClient, make_user: Callable[..., User], percent: int, status: int
) -> None:
    resp = _create(client, make_user(), deposit_percent=percent)
    assert resp.status_code == status
    if status == 201:
        assert resp.json()["deposit_percent"] == percent


def test_update_deposit_and_cutoff(client: TestClient, world: World) -> None:
    url = f"/api/businesses/{world.business.id}"
    h = auth(world.owner)
    assert client.put(url, json={"deposit_percent": 5}, headers=h).status_code == 422
    assert client.put(url, json={"deposit_percent": 150}, headers=h).status_code == 422
    resp = client.put(
        url, json={"deposit_percent": 35, "cancellation_cutoff_hours": 24, "name": None}, headers=h
    )
    assert resp.status_code == 200
    assert resp.json()["deposit_percent"] == 35
    assert resp.json()["cancellation_cutoff_hours"] == 24
    assert resp.json()["name"] == "Glow Salon"  # explicit null ignored for NOT NULL field


@pytest.mark.parametrize(
    "field,value", [("timezone", "Mars/Olympus"), ("currency", "EURO"), ("currency", "12")]
)
def test_create_validates_timezone_and_currency(
    client: TestClient, make_user: Callable[..., User], field: str, value: str
) -> None:
    assert _create(client, make_user(), **{field: value}).status_code == 422


def test_currency_normalised(client: TestClient, make_user: Callable[..., User]) -> None:
    resp = _create(client, make_user(), currency="usd", timezone="Asia/Kolkata")
    assert resp.json()["currency"] == "USD"


def test_unique_slugs(client: TestClient, make_user: Callable[..., User]) -> None:
    owner = make_user()
    slugs = [_create(client, owner, name="Café Ünïcode!").json()["slug"] for _ in range(3)]
    assert slugs == ["cafe-unicode", "cafe-unicode-2", "cafe-unicode-3"]
    assert slugify("!!!") == "business"


def test_public_page_by_slug(
    client: TestClient,
    world: World,
    make_service: Callable[..., Any],
    db: Session,
) -> None:
    hidden = make_service(world.business, name="Hidden", is_active=False)
    world.staff.services.append(hidden)
    db.commit()
    resp = client.get(f"/api/businesses/{world.business.slug}")
    assert resp.status_code == 200
    body = resp.json()
    assert [s["name"] for s in body["services"]] == ["Haircut"]
    assert body["staff"][0]["service_ids"] == [world.service.id]
    assert "email" not in body["staff"][0]
    assert client.get("/api/businesses/does-not-exist").status_code == 404


def test_deactivate_hides_business(client: TestClient, world: World) -> None:
    h = auth(world.owner)
    assert client.delete(f"/api/businesses/{world.business.id}", headers=h).status_code == 204
    assert client.get(f"/api/businesses/{world.business.slug}").status_code == 404
    assert client.get("/api/businesses").json()["total"] == 0
    # Owner still sees it in their own list.
    mine = client.get("/api/me/businesses", headers=h).json()
    assert len(mine) == 1 and mine[0]["is_active"] is False
    one = client.get(f"/api/me/businesses/{world.business.id}", headers=h)
    assert one.status_code == 200


def test_directory_search(client: TestClient, make_business: Callable[..., Business]) -> None:
    make_business(name="Zen Yoga", category=BusinessCategory.fitness, city="Mumbai")
    make_business(name="Smile Dental", category=BusinessCategory.clinic, city="Pune")
    make_business(
        name="Iron Gym", category=BusinessCategory.fitness, city="Pune", description="Lift 100%"
    )
    make_business(name="Closed Spa", city="Pune", is_active=False)

    def names(**params: Any) -> list[str]:
        resp = client.get("/api/businesses", params=params)
        assert resp.status_code == 200
        return [b["name"] for b in resp.json()["items"]]

    assert names() == ["Iron Gym", "Smile Dental", "Zen Yoga"]
    assert names(q="yoga") == ["Zen Yoga"]
    assert names(q="pune") == ["Iron Gym", "Smile Dental"]  # q also matches city
    assert names(q="100%") == ["Iron Gym"]  # LIKE wildcards are escaped
    assert names(q="_") == []  # literal underscore, not a wildcard
    assert names(category="fitness") == ["Iron Gym", "Zen Yoga"]
    assert names(category="fitness", city="pune") == ["Iron Gym"]

    page = client.get("/api/businesses", params={"page_size": 2, "page": 2}).json()
    assert page["total"] == 3 and page["pages"] == 2 and len(page["items"]) == 1
    assert client.get("/api/businesses", params={"category": "nope"}).status_code == 422


def test_business_stats(
    client: TestClient, world: World, make_booking: Callable[..., Any], db: Session
) -> None:
    from datetime import UTC, datetime, timedelta

    make_booking(world.service, world.staff, world.customer, datetime.now(UTC) + timedelta(days=1))
    make_booking(
        world.service,
        world.staff,
        world.customer,
        datetime.now(UTC) + timedelta(days=2),
        status=BookingStatus.cancelled,
    )
    resp = client.get(f"/api/businesses/{world.business.id}/stats", headers=auth(world.owner))
    assert resp.status_code == 200
    body = resp.json()
    assert body["upcoming_count"] == 1
    assert body["currency"] == "INR"
    assert body["deposits_collected_minor"] >= 2000
    assert body["top_services"][0]["name"] == "Haircut"


# --------------------------------------------------------------------------- deposit math


@pytest.mark.parametrize(
    "price,percent,expected",
    [
        (10000, 20, 2000),  # default 20%
        (10000, 10, 1000),  # minimum
        (10000, 100, 10000),
        (1005, 20, 201),
        (1234, 15, 185),  # 185.1 -> 185
        (5, 10, 1),  # 0.5 rounds half-up
        (15, 10, 2),  # 1.5 -> 2
        (25, 10, 3),  # 2.5 -> 3 (not banker's rounding)
        (0, 20, 0),
    ],
)
def test_calc_deposit(price: int, percent: int, expected: int) -> None:
    assert calc_deposit(price, percent) == expected


def test_calc_deposit_rejects_invalid() -> None:
    with pytest.raises(ValueError):
        calc_deposit(-1, 20)
    with pytest.raises(ValueError):
        calc_deposit(100, 101)


def test_currency_formatting() -> None:
    assert currency_exponent("jpy") == 0 and currency_exponent("KWD") == 3
    assert format_money(1250, "usd") == "12.50 USD"
    assert format_money(1250, "JPY") == "1250 JPY"
    assert format_money(1250, "KWD") == "1.250 KWD"
