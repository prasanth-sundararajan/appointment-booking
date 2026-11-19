"""Booking lifecycle: hold, concurrency, expiry, cancel/refund rules, reschedule, status."""

import threading
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Booking, BookingStatus, Payment, PaymentStatus, User
from app.services import booking_service as svc
from app.services.payments.fake import FakePaymentProvider
from tests.conftest import World, at, auth, book, pay


def test_create_booking_holds_slot(
    client: TestClient, world: World, payments: FakePaymentProvider, db: Session
) -> None:
    start = at(world.day, 10)
    resp = book(client, world, start)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "pending_payment"
    assert body["deposit_amount_minor"] == 2000  # 20% of 100.00
    assert body["currency"] == "INR"
    assert body["staff_id"] == world.staff.id
    assert body["checkout_url"].startswith("http://localhost:5173/bookings/success")
    hold = datetime.fromisoformat(body["hold_expires_at"])
    assert timedelta(minutes=9) < hold - datetime.now(UTC) <= timedelta(minutes=10)
    assert payments.checkouts[0]["amount_minor"] == 2000

    payment = db.query(Payment).one()
    assert payment.status == PaymentStatus.pending and payment.checkout_session_id

    # The held slot is gone from the public grid.
    slots = client.get(
        f"/api/businesses/{world.business.id}/slots",
        params={"service_id": world.service.id, "date": world.day.isoformat()},
    ).json()["slots"]
    assert all(not s["start_at"].startswith(f"{world.day}T10:00") for s in slots)


def test_deposit_uses_business_percent_and_currency(
    client: TestClient, world: World, db: Session
) -> None:
    world.business.deposit_percent = 15
    world.business.currency = "JPY"
    world.service.price_minor = 3333
    db.commit()
    body = book(client, world, at(world.day, 10)).json()
    assert body["deposit_amount_minor"] == 500  # 499.95 -> 500
    assert body["currency"] == "JPY"


def test_free_service_confirms_immediately(client: TestClient, world: World, db: Session) -> None:
    world.service.price_minor = 0
    db.commit()
    body = book(client, world, at(world.day, 10)).json()
    assert body["status"] == "confirmed" and body["checkout_url"] is None


def test_booking_validation(client: TestClient, world: World) -> None:
    # Off-grid / outside hours / unknown service.
    assert book(client, world, at(world.day, 10, 5)).status_code == 409
    assert book(client, world, at(world.day, 20)).status_code == 409
    resp = client.post(
        "/api/bookings",
        json={
            "business_id": world.business.id,
            "service_id": 99999,
            "start_at": "2030-01-01T10:00:00Z",
        },
        headers=auth(world.customer),
    )
    assert resp.status_code == 404
    naive = client.post(
        "/api/bookings",
        json={
            "business_id": world.business.id,
            "service_id": world.service.id,
            "start_at": "2030-01-01T10:00:00",
        },
        headers=auth(world.customer),
    )
    assert naive.status_code == 422
    assert client.post("/api/bookings", json={}).status_code == 401


def test_checkout_failure_releases_slot(
    client: TestClient, world: World, payments: FakePaymentProvider
) -> None:
    payments.fail_checkout = True
    resp = book(client, world, at(world.day, 10))
    assert resp.status_code == 502 and resp.json()["error"]["code"] == "CHECKOUT_FAILED"
    payments.fail_checkout = False
    assert book(client, world, at(world.day, 10)).status_code == 201


def test_same_slot_sequential_conflict(
    client: TestClient, world: World, make_user: Callable[..., User]
) -> None:
    assert book(client, world, at(world.day, 10)).status_code == 201
    second = book(client, world, at(world.day, 10, 30), user=make_user())  # overlaps 10:00-11:00
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "SLOT_TAKEN"


def test_concurrent_booking_exactly_one_wins(
    app: Any, world: World, make_user: Callable[..., User], db: Session
) -> None:
    customers = [make_user() for _ in range(2)]
    start = at(world.day, 11)
    barrier = threading.Barrier(len(customers))
    results: list[tuple[int, dict[str, Any]]] = []
    lock = threading.Lock()

    def attempt(user: User) -> None:
        local_client = TestClient(app)
        barrier.wait()
        resp = book(local_client, world, start, user=user)
        with lock:
            results.append((resp.status_code, resp.json()))

    threads = [threading.Thread(target=attempt, args=(c,)) for c in customers]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)

    codes = sorted(code for code, _ in results)
    assert codes == [201, 409], results
    loser = next(body for code, body in results if code == 409)
    assert loser["error"]["code"] == "SLOT_TAKEN"
    assert db.query(Booking).filter(Booking.status == BookingStatus.pending_payment).count() == 1


def test_concurrent_any_staff_spreads_across_staff(
    app: Any,
    world: World,
    make_user: Callable[..., User],
    make_staff: Callable[..., Any],
) -> None:
    make_staff(world.business, [world.service], name="Second")
    start = at(world.day, 12)
    barrier = threading.Barrier(3)
    codes: list[int] = []

    def attempt() -> None:
        local_client = TestClient(app)
        user = customers.pop()
        barrier.wait()
        codes.append(book(local_client, world, start, user=user).status_code)

    customers = [make_user() for _ in range(3)]
    threads = [threading.Thread(target=attempt) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    assert sorted(codes) == [201, 201, 409]


def test_hold_expiry_frees_slot(
    client: TestClient, world: World, make_user: Callable[..., User], db: Session
) -> None:
    first = book(client, world, at(world.day, 10)).json()
    booking = db.get(Booking, first["booking_id"])
    assert booking is not None
    booking.hold_expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()

    assert svc.expire_holds(db, datetime.now(UTC)) == 1
    db.expire_all()
    assert booking.status == BookingStatus.expired and booking.hold_expires_at is None
    assert db.query(Payment).one().status == PaymentStatus.failed
    assert svc.expire_holds(db, datetime.now(UTC)) == 0

    again = book(client, world, at(world.day, 10), user=make_user())
    assert again.status_code == 201


def test_lapsed_hold_is_bookable_before_expiry_job(
    client: TestClient, world: World, make_user: Callable[..., User], db: Session
) -> None:
    """The slot grid shows a lapsed hold as free, so booking it must succeed even if the
    expiry job has not run yet."""
    first = book(client, world, at(world.day, 10)).json()
    booking = db.get(Booking, first["booking_id"])
    assert booking is not None
    booking.hold_expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()

    again = book(client, world, at(world.day, 10), user=make_user())
    assert again.status_code == 201, again.text
    db.expire_all()
    assert booking.status == BookingStatus.expired


# --------------------------------------------------------------------------- cancel


def _confirmed(make_booking: Callable[..., Any], world: World, hours_from_now: float) -> Booking:
    start = datetime.now(UTC) + timedelta(hours=hours_from_now)
    return make_booking(world.service, world.staff, world.customer, start)


def _cancel(client: TestClient, booking: Booking, user: User) -> Any:
    return client.post(
        f"/api/bookings/{booking.id}/cancel", json={"reason": "plans"}, headers=auth(user)
    )


def test_customer_cancel_before_cutoff_full_refund(
    client: TestClient,
    world: World,
    make_booking: Callable[..., Any],
    payments: FakePaymentProvider,
    db: Session,
) -> None:
    booking = _confirmed(make_booking, world, 8.5)
    preview = client.get(
        f"/api/bookings/{booking.id}/cancel-preview", headers=auth(world.customer)
    ).json()
    assert preview["refund"]["eligible"] is True and preview["cutoff_hours"] == 8
    assert preview["cancelled_by"] == "customer" and preview["can_cancel"] is True

    resp = _cancel(client, booking, world.customer)
    assert resp.status_code == 200
    assert resp.json()["refund"] == {"eligible": True, "amount_minor": 2000, "currency": "INR"}
    assert resp.json()["booking"]["status"] == "cancelled"
    assert resp.json()["booking"]["cancelled_by"] == "customer"
    assert len(payments.refunds) == 1 and payments.refunds[0]["amount_minor"] == 2000
    payment = db.query(Payment).one()
    db.refresh(payment)
    assert payment.status == PaymentStatus.refunded and payment.refunded_amount_minor == 2000


def test_customer_cancel_after_cutoff_no_refund(
    client: TestClient,
    world: World,
    make_booking: Callable[..., Any],
    payments: FakePaymentProvider,
    db: Session,
) -> None:
    booking = _confirmed(make_booking, world, 7.5)
    resp = _cancel(client, booking, world.customer)
    assert resp.status_code == 200
    assert resp.json()["refund"]["eligible"] is False
    assert resp.json()["refund"]["amount_minor"] == 0
    assert payments.refunds == []
    payment = db.query(Payment).one()
    db.refresh(payment)
    assert payment.status == PaymentStatus.succeeded


def test_refund_boundary_exactly_at_cutoff(
    world: World, make_booking: Callable[..., Any], db: Session
) -> None:
    booking = _confirmed(make_booking, world, 24)
    loaded = svc.get_booking_for_user(db, booking.id, world.customer)
    from app.models import CancelledBy

    exactly = loaded.start_at - timedelta(hours=8)
    assert svc.refund_decision(loaded, CancelledBy.customer, exactly).eligible is True
    late = exactly + timedelta(seconds=1)
    assert svc.refund_decision(loaded, CancelledBy.customer, late).eligible is False


def test_business_cancel_always_full_refund(
    client: TestClient,
    world: World,
    make_booking: Callable[..., Any],
    make_user: Callable[..., User],
    make_staff: Callable[..., Any],
    payments: FakePaymentProvider,
) -> None:
    booking = _confirmed(make_booking, world, 1)
    resp = _cancel(client, booking, world.owner)
    assert resp.status_code == 200
    assert resp.json()["refund"]["eligible"] is True
    assert resp.json()["booking"]["cancelled_by"] == "business"
    assert len(payments.refunds) == 1

    # Assigned staff member also counts as the business.
    staff_user = make_user()
    staff = make_staff(world.business, [world.service], user=staff_user, name="Staffer")
    other = make_booking(
        world.service, staff, world.customer, datetime.now(UTC) + timedelta(hours=2)
    )
    resp = _cancel(client, other, staff_user)
    assert resp.status_code == 200 and resp.json()["refund"]["eligible"] is True


@pytest.mark.parametrize(
    "cutoff,hours_ahead,eligible",
    [(24, 12, False), (24, 30, True), (2, 3, True), (2, 1, False), (0, 0.5, True)],
)
def test_custom_cutoff_honoured(
    client: TestClient,
    world: World,
    make_booking: Callable[..., Any],
    db: Session,
    cutoff: int,
    hours_ahead: float,
    eligible: bool,
) -> None:
    world.business.cancellation_cutoff_hours = cutoff
    db.commit()
    booking = _confirmed(make_booking, world, hours_ahead)
    resp = _cancel(client, booking, world.customer)
    assert resp.json()["refund"]["eligible"] is eligible


def test_cancel_pending_booking_fails_payment(
    client: TestClient, world: World, db: Session, payments: FakePaymentProvider
) -> None:
    created = book(client, world, at(world.day, 10)).json()
    booking = db.get(Booking, created["booking_id"])
    assert booking is not None
    resp = _cancel(client, booking, world.customer)
    assert resp.status_code == 200 and resp.json()["refund"]["eligible"] is False
    assert payments.refunds == []
    payment = db.query(Payment).one()
    db.refresh(payment)
    assert payment.status == PaymentStatus.failed
    # Slot is free again.
    assert book(client, world, at(world.day, 10)).status_code == 201


def test_cancel_errors(
    client: TestClient,
    world: World,
    make_booking: Callable[..., Any],
    make_user: Callable[..., User],
    payments: FakePaymentProvider,
    db: Session,
) -> None:
    booking = _confirmed(make_booking, world, 48)
    assert _cancel(client, booking, make_user()).status_code == 404
    # Provider failure: the cancellation still commits, the refund stays pending and
    # the scheduler job retries it (same idempotency key, so no double refund).
    payments.fail_refund = True
    assert _cancel(client, booking, world.customer).status_code == 200
    payment = booking.payment
    db.expire_all()
    assert payment.status == PaymentStatus.refund_pending and payment.refund_id is None
    assert payments.refunds == []
    payments.fail_refund = False
    assert svc.retry_pending_refunds(db) == 1
    assert svc.retry_pending_refunds(db) == 0
    db.expire_all()
    assert payment.status == PaymentStatus.refunded and payment.refund_id
    assert len(payments.refunds) == 1
    assert payments.refunds[0]["idempotency_key"] == svc.refund_idempotency_key(payment.id)
    again = _cancel(client, booking, world.customer)
    assert again.status_code == 409 and again.json()["error"]["code"] == "INVALID_BOOKING_STATE"
    missing = client.post("/api/bookings/99999/cancel", headers=auth(world.customer))
    assert missing.status_code == 404


# --------------------------------------------------------------------------- reschedule


def _reschedule(client: TestClient, booking: Booking, user: User, start: datetime) -> Any:
    return client.post(
        f"/api/bookings/{booking.id}/reschedule",
        json={"start_at": start.isoformat()},
        headers=auth(user),
    )


def test_reschedule_keeps_deposit(
    client: TestClient, world: World, make_booking: Callable[..., Any], db: Session
) -> None:
    booking = make_booking(world.service, world.staff, world.customer, at(world.day, 10))
    resp = _reschedule(client, booking, world.customer, at(world.day, 14))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert datetime.fromisoformat(body["start_at"]) == at(world.day, 14)
    assert datetime.fromisoformat(body["end_at"]) == at(world.day, 15)
    assert body["status"] == "confirmed"
    assert body["payment"]["status"] == "succeeded" and body["payment"]["amount_minor"] == 2000
    # Moving within its own old time (overlapping itself) is allowed.
    assert _reschedule(client, booking, world.customer, at(world.day, 14, 30)).status_code == 200


def test_reschedule_rejections(
    client: TestClient,
    world: World,
    make_booking: Callable[..., Any],
    make_user: Callable[..., User],
) -> None:
    other = make_user()
    make_booking(world.service, world.staff, other, at(world.day, 14))
    booking = make_booking(world.service, world.staff, world.customer, at(world.day, 10))
    taken = _reschedule(client, booking, world.customer, at(world.day, 14))
    assert taken.status_code == 409 and taken.json()["error"]["code"] == "SLOT_TAKEN"
    assert _reschedule(client, booking, other, at(world.day, 12)).status_code == 404

    soon = make_booking(
        world.service, world.staff, world.customer, datetime.now(UTC) + timedelta(hours=3)
    )
    late = _reschedule(client, soon, world.customer, at(world.day, 12))
    assert late.status_code == 409 and late.json()["error"]["code"] == "RESCHEDULE_CUTOFF_PASSED"
    # The business may move it anyway.
    assert _reschedule(client, soon, world.owner, at(world.day, 12)).status_code == 200

    pending = make_booking(
        world.service,
        world.staff,
        world.customer,
        at(world.day, 16),
        status=BookingStatus.pending_payment,
        paid=False,
        hold_expires_at=datetime.now(UTC) + timedelta(minutes=5),
    )
    resp = _reschedule(client, pending, world.customer, at(world.day, 9))
    assert resp.status_code == 409 and resp.json()["error"]["code"] == "INVALID_BOOKING_STATE"


# --------------------------------------------------------------------------- status / reads


def test_status_updates(
    client: TestClient,
    world: World,
    make_booking: Callable[..., Any],
) -> None:
    past = make_booking(
        world.service, world.staff, world.customer, datetime.now(UTC) - timedelta(hours=2)
    )
    future = _confirmed(make_booking, world, 24)
    url = "/api/bookings/{}/status"
    ok = client.patch(url.format(past.id), json={"status": "completed"}, headers=auth(world.owner))
    assert ok.status_code == 200 and ok.json()["status"] == "completed"
    ok = client.patch(url.format(past.id), json={"status": "no_show"}, headers=auth(world.owner))
    assert ok.json()["status"] == "no_show"

    early = client.patch(
        url.format(future.id), json={"status": "completed"}, headers=auth(world.owner)
    )
    assert early.status_code == 409
    by_customer = client.patch(
        url.format(past.id), json={"status": "completed"}, headers=auth(world.customer)
    )
    assert by_customer.status_code == 403
    invalid = client.patch(
        url.format(past.id), json={"status": "cancelled"}, headers=auth(world.owner)
    )
    assert invalid.status_code == 422


def test_booking_reads(
    client: TestClient,
    world: World,
    make_booking: Callable[..., Any],
    make_user: Callable[..., User],
) -> None:
    upcoming = _confirmed(make_booking, world, 30)
    make_booking(world.service, world.staff, world.customer, datetime.now(UTC) - timedelta(days=2))
    h = auth(world.customer)
    up = client.get("/api/me/bookings", headers=h).json()
    assert up["total"] == 1 and up["items"][0]["id"] == upcoming.id
    assert up["items"][0]["business"]["slug"] == world.business.slug
    assert client.get("/api/me/bookings", params={"scope": "past"}, headers=h).json()["total"] == 1

    assert client.get(f"/api/bookings/{upcoming.id}", headers=h).status_code == 200
    assert client.get(f"/api/bookings/{upcoming.id}", headers=auth(world.owner)).status_code == 200
    assert client.get(f"/api/bookings/{upcoming.id}", headers=auth(make_user())).status_code == 404

    cal = client.get(
        f"/api/businesses/{world.business.id}/bookings", headers=auth(world.owner)
    ).json()
    assert len(cal) == 2
    filtered = client.get(
        f"/api/businesses/{world.business.id}/bookings",
        params={"from": datetime.now(UTC).isoformat(), "status": "confirmed"},
        headers=auth(world.owner),
    ).json()
    assert [b["id"] for b in filtered] == [upcoming.id]


def test_staff_sees_only_own_bookings(
    client: TestClient,
    world: World,
    make_booking: Callable[..., Any],
    make_user: Callable[..., User],
    make_staff: Callable[..., Any],
) -> None:
    staff_user = make_user()
    mine = make_staff(world.business, [world.service], user=staff_user, name="Mine")
    make_booking(world.service, world.staff, world.customer, at(world.day, 10))
    own = make_booking(world.service, mine, world.customer, at(world.day, 10))
    url = f"/api/businesses/{world.business.id}/bookings"
    got = client.get(url, headers=auth(staff_user)).json()
    assert [b["id"] for b in got] == [own.id]
    forbidden = client.get(url, params={"staff_id": world.staff.id}, headers=auth(staff_user))
    assert forbidden.status_code == 403
    stats = client.get(f"/api/businesses/{world.business.id}/stats", headers=auth(staff_user))
    assert stats.status_code == 200


def test_payment_list(
    client: TestClient,
    world: World,
    payments: FakePaymentProvider,
    make_booking: Callable[..., Any],
) -> None:
    created = book(client, world, at(world.day, 10)).json()
    pay(client, created["booking_id"], payments)
    cancelled = _confirmed(make_booking, world, 48)
    _cancel(client, cancelled, world.customer)
    resp = client.get(f"/api/businesses/{world.business.id}/payments", headers=auth(world.owner))
    assert resp.status_code == 200
    totals = resp.json()["totals"]
    assert totals == {
        "currency": "INR",
        "collected_minor": 4000,
        "refunded_minor": 2000,
        "net_minor": 2000,
        "count": 2,
    }
    assert resp.json()["items"][0]["customer_email"] == world.customer.email
