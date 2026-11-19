"""Realtime: events published on create/confirm/cancel/expire, and WebSocket delivery."""

import importlib
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketDisconnect

from app.models import Booking
from app.services import booking_service as svc
from app.services.payments.fake import FakePaymentProvider
from tests.conftest import World, at, auth, book, pay

rt = importlib.import_module("app.realtime.manager")

Event = tuple[int, str, dict[str, Any]]


@pytest.fixture
def published(monkeypatch: pytest.MonkeyPatch) -> list[Event]:
    events: list[Event] = []
    monkeypatch.setattr(svc, "publish", lambda b, c, e: events.append((b, c, dict(e))))
    return events


def _types(events: list[Event]) -> list[tuple[str, str]]:
    return [(c, e["type"]) for _, c, e in events]


def test_events_on_create_confirm_cancel(
    client: TestClient,
    world: World,
    payments: FakePaymentProvider,
    published: list[Event],
) -> None:
    booking_id = book(client, world, at(world.day, 10)).json()["booking_id"]
    assert _types(published) == [("slots", "slot.taken"), ("dashboard", "booking.created")]
    business_id, _, slot_event = published[0]
    assert business_id == world.business.id
    assert slot_event["data"]["staff_id"] == world.staff.id
    assert slot_event["data"]["start_at"].startswith(f"{world.day}T10:00")

    published.clear()
    pay(client, booking_id, payments)
    assert _types(published) == [("dashboard", "booking.confirmed")]
    assert published[0][2]["data"]["status"] == "confirmed"

    published.clear()
    client.post(f"/api/bookings/{booking_id}/cancel", headers=auth(world.customer))
    assert _types(published) == [("slots", "slot.freed"), ("dashboard", "booking.cancelled")]


def test_events_on_expire(
    client: TestClient, world: World, db: Session, published: list[Event]
) -> None:
    booking_id = book(client, world, at(world.day, 10)).json()["booking_id"]
    published.clear()
    booking = db.get(Booking, booking_id)
    assert booking is not None
    booking.hold_expires_at = datetime.now(UTC) - timedelta(seconds=5)
    db.commit()
    svc.expire_holds(db, datetime.now(UTC))
    assert _types(published) == [("slots", "slot.freed"), ("dashboard", "booking.expired")]


def test_events_on_reschedule_and_status(
    client: TestClient,
    world: World,
    make_booking: Callable[..., Any],
    published: list[Event],
) -> None:
    booking = make_booking(world.service, world.staff, world.customer, at(world.day, 10))
    client.post(
        f"/api/bookings/{booking.id}/reschedule",
        json={"start_at": at(world.day, 13).isoformat()},
        headers=auth(world.customer),
    )
    assert _types(published) == [
        ("slots", "slot.freed"),
        ("slots", "slot.taken"),
        ("dashboard", "booking.rescheduled"),
    ]
    assert published[0][2]["data"]["start_at"].startswith(f"{world.day}T10:00")

    published.clear()
    past = make_booking(
        world.service, world.staff, world.customer, datetime.now(UTC) - timedelta(hours=3)
    )
    client.patch(
        f"/api/bookings/{past.id}/status", json={"status": "completed"}, headers=auth(world.owner)
    )
    assert _types(published) == [("dashboard", "booking.updated")]


def test_publish_failure_is_swallowed(
    client: TestClient, world: World, monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(*args: Any) -> None:
        raise RuntimeError("down")

    monkeypatch.setattr(svc, "publish", boom)
    assert book(client, world, at(world.day, 10)).status_code == 201


# --------------------------------------------------------------------------- WebSockets


def test_slots_socket_ping_and_broadcast(client: TestClient, world: World) -> None:
    with client.websocket_connect(f"/ws/businesses/{world.business.id}/slots") as ws:
        ws.send_text("ping")
        assert ws.receive_json() == {"type": "pong"}
        assert rt.manager.connection_count(world.business.id, rt.CHANNEL_SLOTS) == 1
        # Real publish (pg_notify + in-process delivery, no LISTEN thread in tests).
        rt.publish(world.business.id, rt.CHANNEL_SLOTS, {"type": "slot.freed", "data": {"x": 1}})
        assert ws.receive_json() == {"type": "slot.freed", "data": {"x": 1}}
    assert rt.manager.connection_count(world.business.id, rt.CHANNEL_SLOTS) == 0


def test_booking_reaches_slot_socket(client: TestClient, world: World) -> None:
    with client.websocket_connect(f"/ws/businesses/{world.business.id}/slots") as ws:
        assert book(client, world, at(world.day, 10)).status_code == 201
        msg = ws.receive_json()
        assert msg["type"] == "slot.taken"


def test_dashboard_socket_auth(
    client: TestClient, world: World, make_user: Callable[..., Any]
) -> None:
    from app.auth.security import create_access_token, create_ws_ticket

    url = f"/ws/businesses/{world.business.id}/dashboard"
    access = create_access_token(world.owner.id)
    for query in ("", "?ticket=bad", f"?token={access}", f"?ticket={access}"):
        with client.websocket_connect(url + query) as ws, pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
        assert exc.value.code == 4401

    # Ticket endpoint checks membership.
    outsider = make_user()
    body = {"business_id": world.business.id}
    assert client.post("/api/ws/ticket", json=body, headers=auth(outsider)).status_code == 403
    assert client.post("/api/ws/ticket", json=body).status_code == 401

    # A ticket for another business is rejected.
    other, _ = create_ws_ticket(world.owner.id, world.business.id + 1000)
    with client.websocket_connect(f"{url}?ticket={other}") as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
    assert exc.value.code == 4401

    # A (forged-membership) ticket for a non-member is still checked against the DB.
    stray, _ = create_ws_ticket(outsider.id, world.business.id)
    with client.websocket_connect(f"{url}?ticket={stray}") as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
    assert exc.value.code == 4403

    resp = client.post("/api/ws/ticket", json=body, headers=auth(world.owner))
    assert resp.status_code == 200 and resp.json()["expires_in"] == 60
    ticket = resp.json()["ticket"]
    with client.websocket_connect(f"{url}?ticket={ticket}") as ws:
        ws.send_text("PING")
        assert ws.receive_json() == {"type": "pong"}

    # Single use: the same ticket cannot be replayed.
    with client.websocket_connect(f"{url}?ticket={ticket}") as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
    assert exc.value.code == 4401


def test_unknown_business_socket(client: TestClient) -> None:
    with client.websocket_connect("/ws/businesses/99999/slots") as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
    assert exc.value.code == 4404


def test_publish_non_serialisable_is_ignored() -> None:
    rt.publish(1, rt.CHANNEL_SLOTS, {"type": "x", "data": {1, 2}})  # set -> str via default
    rt.publish(1, rt.CHANNEL_SLOTS, {"type": "x", "bad": float("nan")})
