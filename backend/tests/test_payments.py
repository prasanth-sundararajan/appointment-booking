"""Dodo webhook: signature verification, idempotency, confirmation, late payments."""

import base64
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Booking, BookingStatus, Payment, PaymentStatus, User, WebhookEvent
from app.services import booking_service as svc
from app.services.payments import WebhookVerificationError
from app.services.payments.fake import FakePaymentProvider
from app.services.payments.webhook_parsing import parse_dodo_payload
from tests.conftest import World, at, book, pay, post_webhook, signed_webhook

WEBHOOK_URL = "/api/payments/dodo/webhook"


def _booking(db: Session, booking_id: int) -> Booking:
    db.expire_all()
    booking = db.get(Booking, booking_id)
    assert booking is not None
    return booking


def test_rejects_bad_signature(client: TestClient, world: World) -> None:
    body, headers = signed_webhook("payment.succeeded", {"metadata": {"booking_id": "1"}})
    tampered = body.replace(b"payment.succeeded", b"payment.failed")
    resp = client.post(WEBHOOK_URL, content=tampered, headers=headers)
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "INVALID_SIGNATURE"

    other_secret = "whsec_" + base64.b64encode(b"x" * 32).decode()
    body, headers = signed_webhook("payment.succeeded", {}, secret=other_secret)
    assert client.post(WEBHOOK_URL, content=body, headers=headers).status_code == 401

    assert client.post(WEBHOOK_URL, content=b"{}").status_code == 401  # no headers

    body, headers = signed_webhook("payment.succeeded", {})
    headers["webhook-timestamp"] = str(int((datetime.now(UTC) - timedelta(hours=1)).timestamp()))
    assert client.post(WEBHOOK_URL, content=body, headers=headers).status_code == 401


def test_payment_succeeded_confirms_and_is_idempotent(
    client: TestClient, world: World, payments: FakePaymentProvider, db: Session
) -> None:
    booking_id = book(client, world, at(world.day, 10)).json()["booking_id"]
    checkout = payments.checkouts[0]
    data = {"payment_id": checkout["payment_id"], "metadata": {"booking_id": str(booking_id)}}

    first = post_webhook(client, "payment.succeeded", data, event_id="evt_same")
    assert first.status_code == 200 and first.json() == {"received": True, "duplicate": False}
    booking = _booking(db, booking_id)
    assert booking.status == BookingStatus.confirmed and booking.hold_expires_at is None
    assert db.query(Payment).one().status == PaymentStatus.succeeded

    dup = post_webhook(client, "payment.succeeded", data, event_id="evt_same")
    assert dup.json()["duplicate"] is True
    assert db.query(WebhookEvent).count() == 1

    # A different event id for an already-applied payment is a no-op.
    again = post_webhook(client, "payment.succeeded", data)
    assert again.json()["duplicate"] is False
    assert _booking(db, booking_id).status == BookingStatus.confirmed
    assert payments.refunds == []


def test_lookup_by_payment_or_session_id(
    client: TestClient, world: World, payments: FakePaymentProvider, db: Session
) -> None:
    b1 = book(client, world, at(world.day, 10)).json()["booking_id"]
    b2 = book(client, world, at(world.day, 12)).json()["booking_id"]
    post_webhook(client, "payment.succeeded", {"payment_id": payments.checkouts[0]["payment_id"]})
    post_webhook(
        client, "payment.succeeded", {"checkout_session_id": payments.checkouts[1]["session_id"]}
    )
    assert _booking(db, b1).status == BookingStatus.confirmed
    assert _booking(db, b2).status == BookingStatus.confirmed
    unknown = post_webhook(client, "payment.succeeded", {"payment_id": "nope"})
    assert unknown.status_code == 200


def test_late_payment_on_expired_hold_with_slot_taken_refunds(
    client: TestClient,
    world: World,
    payments: FakePaymentProvider,
    db: Session,
    make_user: Callable[..., User],
) -> None:
    first = book(client, world, at(world.day, 10)).json()["booking_id"]
    booking = _booking(db, first)
    booking.hold_expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db.commit()
    svc.expire_holds(db, datetime.now(UTC))

    taker = book(client, world, at(world.day, 10), user=make_user())
    assert taker.status_code == 201

    resp = pay(client, first, payments)
    assert resp.status_code == 200
    late = _booking(db, first)
    assert late.status == BookingStatus.expired
    assert len(payments.refunds) == 1
    assert payments.refunds[0]["payment_id"] == payments.checkouts[0]["payment_id"]
    payment = db.query(Payment).filter(Payment.booking_id == first).one()
    assert payment.status == PaymentStatus.refunded and payment.refund_id
    assert _booking(db, taker.json()["booking_id"]).status == BookingStatus.pending_payment


def test_late_payment_on_expired_hold_with_free_slot_reconfirms(
    client: TestClient, world: World, payments: FakePaymentProvider, db: Session
) -> None:
    first = book(client, world, at(world.day, 10)).json()["booking_id"]
    booking = _booking(db, first)
    booking.hold_expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db.commit()
    svc.expire_holds(db, datetime.now(UTC))

    pay(client, first, payments)
    assert _booking(db, first).status == BookingStatus.confirmed
    assert payments.refunds == []


def test_payment_after_cancellation_is_refunded(
    client: TestClient, world: World, payments: FakePaymentProvider, db: Session
) -> None:
    from tests.conftest import auth

    first = book(client, world, at(world.day, 10)).json()["booking_id"]
    client.post(f"/api/bookings/{first}/cancel", headers=auth(world.customer))
    pay(client, first, payments)
    assert _booking(db, first).status == BookingStatus.cancelled
    assert len(payments.refunds) == 1


def test_payment_failed_releases_hold(
    client: TestClient, world: World, payments: FakePaymentProvider, db: Session
) -> None:
    first = book(client, world, at(world.day, 10)).json()["booking_id"]
    post_webhook(client, "payment.failed", {"metadata": {"booking_id": str(first)}})
    assert _booking(db, first).status == BookingStatus.expired
    assert db.query(Payment).one().status == PaymentStatus.failed
    assert book(client, world, at(world.day, 10)).status_code == 201


def test_refund_webhooks(
    client: TestClient, world: World, make_booking: Callable[..., Any], db: Session
) -> None:
    booking = make_booking(world.service, world.staff, world.customer, at(world.day, 10))
    meta = {"metadata": {"booking_id": str(booking.id)}}
    post_webhook(client, "refund.failed", meta)
    post_webhook(client, "something.else", meta)
    post_webhook(client, "refund.succeeded", {**meta, "refund_id": "ref_1", "amount": 1500})
    db.expire_all()
    payment = db.query(Payment).one()
    assert payment.status == PaymentStatus.refunded
    assert payment.refund_id == "ref_1" and payment.refunded_amount_minor == 1500


def test_processing_error_rolls_back_for_retry(
    client: TestClient,
    world: World,
    payments: FakePaymentProvider,
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    first = book(client, world, at(world.day, 10)).json()["booking_id"]

    def boom(*args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("db hiccup")

    monkeypatch.setattr(svc, "confirm_booking_payment", boom)
    body, headers = signed_webhook(
        "payment.succeeded", {"metadata": {"booking_id": str(first)}}, "evt_retry"
    )
    no_raise = TestClient(client.app, raise_server_exceptions=False)
    resp = no_raise.post(WEBHOOK_URL, content=body, headers=headers)
    assert resp.status_code == 500
    assert db.query(WebhookEvent).count() == 0  # provider retry will be processed
    monkeypatch.undo()
    retry = post_webhook(
        client, "payment.succeeded", {"metadata": {"booking_id": str(first)}}, "evt_retry"
    )
    assert retry.json()["duplicate"] is False
    assert _booking(db, first).status == BookingStatus.confirmed


def test_parse_payload_errors() -> None:
    with pytest.raises(WebhookVerificationError):
        parse_dodo_payload(b"not json", {"webhook-id": "x"})
    with pytest.raises(WebhookVerificationError):
        parse_dodo_payload(b"[]", {"webhook-id": "x"})
    with pytest.raises(WebhookVerificationError):
        parse_dodo_payload(b'{"data": {}}', {"webhook-id": "x"})
    payload = parse_dodo_payload(
        b'{"id": "e1", "type": "payment.succeeded", "data": {"total_amount": 5, '
        b'"metadata": {"booking_id": "abc"}}}',
        {},
    )
    assert payload.event_id == "e1" and payload.amount_minor == 5 and payload.booking_id is None
