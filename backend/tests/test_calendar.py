"""Google Calendar sync with a fake client: OAuth connect, push on confirm/cancel,
busy-block pull, notifications and watches."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Booking, CalendarBusyBlock, CalendarConnection, StaffMember, User
from app.routers.calendar import STATE_COOKIE, STATE_COOKIE_PATH
from app.services import calendar_sync
from app.services import google_calendar as gc
from app.services.payments.fake import FakePaymentProvider
from app.services.token_crypto import decrypt_token, encrypt_token
from tests.conftest import FakeGoogleClient, World, at, auth, book, pay


@pytest.fixture
def staff_user(world: World, db: Session, make_user: Callable[..., User]) -> User:
    """The world's staff member, linked to a user account (role staff)."""
    from app.models import UserRole

    user = make_user(role=UserRole.staff)
    world.staff.user_id = user.id
    db.commit()
    return user


def _slot_starts(client: TestClient, w: World) -> list[str]:
    resp = client.get(
        f"/api/businesses/{w.business.id}/slots",
        params={"service_id": w.service.id, "date": w.day.isoformat()},
    )
    return [s["start_at"][11:16] for s in resp.json()["slots"]]


# --------------------------------------------------------------------------- OAuth connect


def test_connect_requires_owner_or_staff(client: TestClient, world: World) -> None:
    assert (
        client.get("/api/calendar/google/connect", headers=auth(world.customer)).status_code == 403
    )
    resp = client.get("/api/calendar/google/connect", headers=auth(world.owner))
    assert resp.status_code == 200
    state = parse_qs(urlparse(resp.json()["url"]).query)["state"][0]
    assert gc.verify_oauth_state(state) == world.owner.id


def test_connect_not_configured(
    client: TestClient, world: World, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    resp = client.get("/api/calendar/google/connect", headers=auth(world.owner))
    assert resp.status_code == 503 and resp.json()["error"]["code"] == "CALENDAR_NOT_CONFIGURED"


def _callback(client: TestClient, **params: str) -> Any:
    return client.get("/api/calendar/google/callback", params=params, follow_redirects=False)


def _bound_state(client: TestClient, user_id: int) -> str:
    """State bound to a browser nonce cookie, as /connect would set it."""
    nonce = gc.new_browser_nonce()
    client.cookies.set(STATE_COOKIE, nonce, path=STATE_COOKIE_PATH)
    return gc.create_oauth_state(user_id, browser_nonce=nonce)


def test_callback_rejects_state_without_matching_cookie(client: TestClient, world: World) -> None:
    unbound = gc.create_oauth_state(world.owner.id)
    _, query = _redirect_query(_callback(client, code="c", state=unbound))
    assert query == {"error": ["invalid_state"]}
    state = _bound_state(client, world.owner.id)
    client.cookies.set(STATE_COOKIE, "someone-elses-nonce", path=STATE_COOKIE_PATH)
    _, query = _redirect_query(_callback(client, code="c", state=state))
    assert query == {"error": ["invalid_state"]}


def test_connect_sets_nonce_cookie(client: TestClient, world: World) -> None:
    resp = client.get("/api/calendar/google/connect", headers=auth(world.owner))
    nonce = resp.cookies.get(STATE_COOKIE)
    assert nonce
    state = parse_qs(urlparse(resp.json()["url"]).query)["state"][0]
    assert gc.verify_oauth_state(state, browser_nonce=nonce) == world.owner.id


def _redirect_query(resp: Any) -> tuple[str, dict[str, list[str]]]:
    assert resp.status_code == 302
    parsed = urlparse(resp.headers["location"])
    return parsed.path, parse_qs(parsed.query)


@pytest.mark.parametrize(
    "params,reason",
    [
        ({"error": "access_denied"}, "access_denied"),
        ({"state": "x"}, "missing_code"),
        ({"code": "c", "state": "forged"}, "invalid_state"),
    ],
)
def test_callback_errors(client: TestClient, params: dict[str, str], reason: str) -> None:
    path, query = _redirect_query(_callback(client, **params))
    assert path == "/settings/calendar"
    assert query == {"error": [reason]}


def test_callback_unknown_user_and_exchange_failure(
    client: TestClient, world: World, google: FakeGoogleClient
) -> None:
    _, query = _redirect_query(_callback(client, code="c", state=_bound_state(client, 99999)))
    assert query == {"error": ["invalid_user"]}
    google.fail_exchange = True
    _, query = _redirect_query(
        _callback(client, code="c", state=_bound_state(client, world.owner.id))
    )
    assert query == {"error": ["exchange_failed"]}


def test_callback_success_stores_encrypted_tokens(
    client: TestClient,
    world: World,
    staff_user: User,
    google: FakeGoogleClient,
    db: Session,
) -> None:
    google.events = [
        gc.CalendarEvent("ext1", at(world.day, 9), at(world.day, 10), slotease_booking_id=None)
    ]
    path, query = _redirect_query(
        _callback(client, code="auth-code", state=_bound_state(client, staff_user.id))
    )
    assert path == "/settings/calendar" and query == {"connected": ["1"]}
    assert ("exchange_code", ("auth-code",)) in google.calls

    conn = db.scalars(select(CalendarConnection)).one()
    assert conn.staff_id == world.staff.id
    assert conn.access_token_enc != "access-tok"
    assert decrypt_token(conn.access_token_enc) == "access-tok"
    assert decrypt_token(conn.refresh_token_enc or "") == "refresh-tok"
    # Background initial pull stored the external event as a busy block.
    assert db.scalars(select(CalendarBusyBlock)).one().connection_id == conn.id

    status = client.get("/api/calendar/google/status", headers=auth(staff_user)).json()
    assert status["connected"] is True and status["busy_block_count"] == 1
    assert status["staff_id"] == world.staff.id and status["watch_active"] is False

    # Reconnecting reuses the same row.
    _callback(client, code="again", state=_bound_state(client, staff_user.id))
    db.expire_all()
    assert len(db.scalars(select(CalendarConnection)).all()) == 1


def test_status_and_disconnect(
    client: TestClient,
    world: World,
    staff_user: User,
    make_connection: Callable[..., CalendarConnection],
    db: Session,
) -> None:
    h = auth(staff_user)
    assert client.get("/api/calendar/google/status", headers=h).json()["connected"] is False
    assert client.delete("/api/calendar/google", headers=h).status_code == 404
    conn = make_connection(staff_user, world.staff)
    conn.watch_channel_id, conn.watch_resource_id = "chan", "res"
    db.commit()
    assert client.delete("/api/calendar/google", headers=h).status_code == 204
    db.expire_all()
    assert db.scalars(select(CalendarConnection)).all() == []


# --------------------------------------------------------------------------- push


def test_push_on_confirm_and_cancel(
    client: TestClient,
    world: World,
    staff_user: User,
    make_connection: Callable[..., CalendarConnection],
    payments: FakePaymentProvider,
    google: FakeGoogleClient,
    db: Session,
) -> None:
    make_connection(staff_user, world.staff)
    booking_id = book(client, world, at(world.day, 10)).json()["booking_id"]
    assert "create_event" not in google.names()  # nothing pushed while only held

    pay(client, booking_id, payments)
    creates = [c for c in google.calls if c[0] == "create_event"]
    assert len(creates) == 1
    calendar_id, body = creates[0][1]
    assert calendar_id == "primary"
    assert body["summary"] == "Haircut - Cara Customer"
    assert body["extendedProperties"]["private"]["slotease_booking_id"] == str(booking_id)
    assert body["start"]["timeZone"] == "UTC"
    db.expire_all()
    booking = db.get(Booking, booking_id)
    assert booking is not None and booking.google_event_id == "evt_1"

    # Reschedule patches the same event.
    client.post(
        f"/api/bookings/{booking_id}/reschedule",
        json={"start_at": at(world.day, 14).isoformat()},
        headers=auth(world.customer),
    )
    assert google.names().count("patch_event") == 1

    client.post(f"/api/bookings/{booking_id}/cancel", headers=auth(world.customer))
    assert ("delete_event", ("primary", "evt_1")) in google.calls
    db.expire_all()
    assert db.get(Booking, booking_id).google_event_id is None


def test_push_without_connection_is_noop(
    client: TestClient, world: World, payments: FakePaymentProvider, google: FakeGoogleClient
) -> None:
    booking_id = book(client, world, at(world.day, 10)).json()["booking_id"]
    pay(client, booking_id, payments)
    assert google.calls == []


def test_push_errors_never_break_booking(
    client: TestClient,
    world: World,
    staff_user: User,
    make_connection: Callable[..., CalendarConnection],
    payments: FakePaymentProvider,
    google: FakeGoogleClient,
    monkeypatch: pytest.MonkeyPatch,
    db: Session,
) -> None:
    make_connection(staff_user, world.staff)

    def fail(*args: Any) -> str:
        raise gc.GoogleCalendarError("quota", 403)

    monkeypatch.setattr(google, "create_event", fail)
    booking_id = book(client, world, at(world.day, 10)).json()["booking_id"]
    assert pay(client, booking_id, payments).status_code == 200
    db.expire_all()
    assert db.get(Booking, booking_id).google_event_id is None

    # The retry job pushes it once Google works again.
    monkeypatch.undo()
    gc.set_google_client(google)
    assert calendar_sync.retry_pending_pushes(db) == 1
    db.expire_all()
    assert db.get(Booking, booking_id).google_event_id is not None


def test_patch_on_missing_event_recreates(
    world: World,
    staff_user: User,
    make_connection: Callable[..., CalendarConnection],
    make_booking: Callable[..., Any],
    google: FakeGoogleClient,
    monkeypatch: pytest.MonkeyPatch,
    db: Session,
) -> None:
    make_connection(staff_user, world.staff)
    booking = make_booking(world.service, world.staff, world.customer, at(world.day, 10))
    booking.google_event_id = "gone"
    db.commit()

    def missing(*args: Any) -> None:
        raise gc.GoogleCalendarError("not found", 410)

    monkeypatch.setattr(google, "patch_event", missing)
    calendar_sync.push_booking_event(booking.id)
    db.expire_all()
    assert db.get(Booking, booking.id).google_event_id == "evt_1"


def test_expired_access_token_is_refreshed(
    world: World,
    staff_user: User,
    make_connection: Callable[..., CalendarConnection],
    google: FakeGoogleClient,
    db: Session,
) -> None:
    conn = make_connection(staff_user, world.staff)
    conn.token_expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db.commit()
    assert calendar_sync.get_access_token(db, conn) == "access-new"
    assert ("refresh_access_token", ("refresh-tok",)) in google.calls
    db.refresh(conn)
    assert decrypt_token(conn.access_token_enc) == "access-new"

    conn.token_expires_at = datetime.now(UTC) - timedelta(minutes=1)
    conn.refresh_token_enc = None
    db.commit()
    with pytest.raises(gc.GoogleCalendarError):
        calendar_sync.get_access_token(db, conn)


# --------------------------------------------------------------------------- pull


def test_busy_blocks_remove_slots(
    client: TestClient,
    world: World,
    staff_user: User,
    make_connection: Callable[..., CalendarConnection],
    make_booking: Callable[..., Any],
    google: FakeGoogleClient,
    db: Session,
) -> None:
    conn = make_connection(staff_user, world.staff)
    own = make_booking(world.service, world.staff, world.customer, at(world.day, 15))
    own.google_event_id = "evt_own"
    db.commit()
    google.events = [
        gc.CalendarEvent("ext", at(world.day, 9), at(world.day, 11), None),
        gc.CalendarEvent("evt_own", at(world.day, 15), at(world.day, 16), None),
        gc.CalendarEvent("tagged", at(world.day, 12), at(world.day, 13), str(own.id)),
    ]
    assert "09:00" in _slot_starts(client, world)
    assert calendar_sync.refresh_busy_blocks(db, conn) == 1

    starts = _slot_starts(client, world)
    assert starts[0] == "11:00"
    assert "12:00" in starts  # SlotEase-tagged event ignored

    # Next refresh replaces (not appends) the cached blocks.
    google.events = []
    calendar_sync.refresh_connection(conn.id)
    assert "09:00" in _slot_starts(client, world)
    assert calendar_sync.refresh_all_busy_blocks(db) == 1


def test_busy_block_rejects_booking(
    client: TestClient,
    world: World,
    staff_user: User,
    make_connection: Callable[..., CalendarConnection],
    db: Session,
) -> None:
    conn = make_connection(staff_user, world.staff)
    db.add(
        CalendarBusyBlock(
            connection_id=conn.id, start_at=at(world.day, 10), end_at=at(world.day, 11)
        )
    )
    db.commit()
    resp = book(client, world, at(world.day, 10))
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "SLOT_TAKEN"


# ------------------------------------------------------------- notifications / watches


def test_notifications_endpoint(
    client: TestClient,
    world: World,
    staff_user: User,
    make_connection: Callable[..., CalendarConnection],
    google: FakeGoogleClient,
    db: Session,
) -> None:
    conn = make_connection(staff_user, world.staff)
    conn.watch_channel_id = "chan-1"
    db.commit()
    url = "/api/calendar/google/notifications"
    good = {"X-Goog-Channel-ID": "chan-1", "X-Goog-Channel-Token": gc.channel_token_for("chan-1")}

    assert client.post(url).status_code == 403
    bad = {**good, "X-Goog-Channel-Token": "forged"}
    assert client.post(url, headers=bad).status_code == 403

    assert client.post(url, headers={**good, "X-Goog-Resource-State": "sync"}).status_code == 200
    assert "list_events" not in google.names()
    assert client.post(url, headers={**good, "X-Goog-Resource-State": "exists"}).status_code == 200
    assert "list_events" in google.names()

    stale = {"X-Goog-Channel-ID": "old", "X-Goog-Channel-Token": gc.channel_token_for("old")}
    assert client.post(url, headers=stale).status_code == 200


def test_watch_lifecycle(
    world: World,
    staff_user: User,
    make_connection: Callable[..., CalendarConnection],
    google: FakeGoogleClient,
    monkeypatch: pytest.MonkeyPatch,
    db: Session,
) -> None:
    conn = make_connection(staff_user, world.staff)
    assert calendar_sync.create_watch(db, conn) is False  # http BACKEND_URL
    assert calendar_sync.renew_watches(db) == 0

    monkeypatch.setattr(settings, "BACKEND_URL", "https://api.example.com")
    assert calendar_sync.create_watch(db, conn) is True
    assert conn.watch_resource_id == "res-1" and conn.watch_channel_id
    first_channel = conn.watch_channel_id

    conn.watch_expires_at = datetime.now(UTC) + timedelta(hours=2)
    db.commit()
    assert calendar_sync.renew_watches(db) == 1
    assert ("stop_channel", (first_channel, "res-1")) in google.calls
    assert conn.watch_channel_id != first_channel


def test_token_crypto_roundtrip() -> None:
    from app.services.token_crypto import (
        TokenCryptoError,
        decrypt_optional,
        encrypt_optional,
    )

    assert decrypt_optional(encrypt_optional("abc")) == "abc"
    assert encrypt_optional(None) is None and decrypt_optional(None) is None
    with pytest.raises(TokenCryptoError):
        decrypt_token(encrypt_token("x")[:-4] + "AAAA")


def test_staff_connection_link(db: Session, world: World, staff_user: User) -> None:
    from app.routers.calendar import _staff_for_user

    staff = _staff_for_user(db, staff_user.id)
    assert isinstance(staff, StaffMember) and staff.id == world.staff.id
