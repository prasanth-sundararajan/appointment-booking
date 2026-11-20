"""Shared fixtures for the SlotEase backend test-suite.

Environment variables are set BEFORE any `app` import so `Settings()` and the engine
pick up the throwaway test database (TEST_DATABASE_URL).
"""

import base64
import json
import os
import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from cryptography.fernet import Fernet

WEBHOOK_SECRET = "whsec_" + base64.b64encode(b"slotease-test-webhook-secret-32b").decode()

os.environ["ENVIRONMENT"] = "test"
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://postgres:test@localhost:55432/slotease_test"
)
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production-0123456789"
os.environ["SCHEDULER_ENABLED"] = "false"
os.environ["DODO_API_KEY"] = ""
os.environ["DODO_WEBHOOK_SECRET"] = WEBHOOK_SECRET
os.environ["GOOGLE_CLIENT_ID"] = "test-google-client-id"
os.environ["GOOGLE_CLIENT_SECRET"] = "test-google-client-secret"
os.environ["TOKEN_ENCRYPTION_KEY"] = Fernet.generate_key().decode()
os.environ["SMTP_HOST"] = ""
os.environ["BACKEND_URL"] = "http://localhost:8000"
os.environ["FRONTEND_URL"] = "http://localhost:5173"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402
from standardwebhooks.webhooks import Webhook  # noqa: E402

from app.auth.security import create_access_token, hash_password  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import (  # noqa: E402
    Booking,
    BookingStatus,
    Business,
    CalendarConnection,
    Payment,
    PaymentStatus,
    Service,
    StaffMember,
    User,
    UserRole,
    WorkingHours,
)
from app.rate_limit import limiter  # noqa: E402
from app.services import google_calendar as gc  # noqa: E402
from app.services.payments import set_payment_provider  # noqa: E402
from app.services.payments.fake import FakePaymentProvider  # noqa: E402
from app.services.token_crypto import encrypt_token  # noqa: E402

PASSWORD = "password123"


# --------------------------------------------------------------------------- database


@pytest.fixture(scope="session", autouse=True)
def _schema() -> Iterator[None]:
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS btree_gist"))
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def _truncate() -> Iterator[None]:
    yield
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text("SET LOCAL lock_timeout = '15s'"))
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture
def db() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


# --------------------------------------------------------------------------- app / fakes


@pytest.fixture(autouse=True)
def _no_rate_limit() -> Iterator[None]:
    previous = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = previous


@pytest.fixture(autouse=True)
def payments() -> Iterator[FakePaymentProvider]:
    provider = FakePaymentProvider(webhook_secret=WEBHOOK_SECRET)
    set_payment_provider(provider)
    yield provider
    set_payment_provider(None)


@dataclass
class FakeGoogleClient:
    """In-memory GoogleCalendarClient recording every call."""

    calls: list[tuple[str, tuple[Any, ...]]] = field(default_factory=list)
    events: list[gc.CalendarEvent] = field(default_factory=list)
    fail_exchange: bool = False
    _counter: int = 0

    def _rec(self, name: str, *args: Any) -> None:
        self.calls.append((name, args))

    def names(self) -> list[str]:
        return [c[0] for c in self.calls]

    def build_auth_url(self, state: str) -> str:
        return f"https://accounts.google.com/o/oauth2/v2/auth?state={state}"

    def exchange_code(self, code: str) -> gc.OAuthTokens:
        self._rec("exchange_code", code)
        if self.fail_exchange:
            raise gc.GoogleCalendarError("boom", 400)
        return gc.OAuthTokens("access-tok", "refresh-tok", datetime.now(UTC) + timedelta(hours=1))

    def refresh_access_token(self, refresh_token: str) -> gc.OAuthTokens:
        self._rec("refresh_access_token", refresh_token)
        return gc.OAuthTokens("access-new", refresh_token, datetime.now(UTC) + timedelta(hours=1))

    def revoke_token(self, token: str) -> None:
        self._rec("revoke_token", token)

    def create_event(self, access_token: str, calendar_id: str, body: dict[str, Any]) -> str:
        self._counter += 1
        self._rec("create_event", calendar_id, body)
        return f"evt_{self._counter}"

    def patch_event(
        self, access_token: str, calendar_id: str, event_id: str, body: dict[str, Any]
    ) -> None:
        self._rec("patch_event", calendar_id, event_id, body)

    def delete_event(self, access_token: str, calendar_id: str, event_id: str) -> None:
        self._rec("delete_event", calendar_id, event_id)

    def list_events(
        self, access_token: str, calendar_id: str, time_min: datetime, time_max: datetime
    ) -> list[gc.CalendarEvent]:
        self._rec("list_events", calendar_id)
        return list(self.events)

    def freebusy(
        self, access_token: str, calendar_id: str, time_min: datetime, time_max: datetime
    ) -> list[tuple[datetime, datetime]]:
        return [(e.start_at, e.end_at) for e in self.events]

    def watch_events(
        self, access_token: str, calendar_id: str, channel_id: str, token: str, address: str
    ) -> gc.WatchChannel:
        self._rec("watch_events", channel_id)
        return gc.WatchChannel(channel_id, "res-1", datetime.now(UTC) + timedelta(days=7))

    def stop_channel(self, access_token: str, channel_id: str, resource_id: str) -> None:
        self._rec("stop_channel", channel_id, resource_id)


@pytest.fixture(autouse=True)
def google() -> Iterator[FakeGoogleClient]:
    client = FakeGoogleClient()
    gc.set_google_client(client)
    yield client
    gc.set_google_client(None)


@pytest.fixture(scope="session")
def app() -> Any:
    return create_app()


@pytest.fixture
def client(app: Any) -> Iterator[TestClient]:
    # No `with`: the lifespan (LISTEN thread, scheduler) is not started in tests.
    yield TestClient(app)


# --------------------------------------------------------------------------- factories


def auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def next_weekday_date(days_ahead: int = 2) -> date:
    return (datetime.now(UTC) + timedelta(days=days_ahead)).date()


def at(day: date, hh: int, mm: int = 0, tz: Any = UTC) -> datetime:
    return datetime.combine(day, time(hh, mm), tzinfo=tz)


@pytest.fixture
def make_user(db: Session) -> Callable[..., User]:
    def _make(
        email: str | None = None,
        role: UserRole = UserRole.customer,
        password: str | None = None,
        full_name: str = "Test User",
    ) -> User:
        user = User(
            email=email or f"u{uuid.uuid4().hex[:8]}@example.com",
            hashed_password=hash_password(password) if password else None,
            full_name=full_name,
            role=role,
        )
        db.add(user)
        db.commit()
        return user

    return _make


@pytest.fixture
def make_business(db: Session, make_user: Callable[..., User]) -> Callable[..., Business]:
    def _make(owner: User | None = None, **kw: Any) -> Business:
        owner = owner or make_user(role=UserRole.owner)
        name = kw.pop("name", f"Biz {uuid.uuid4().hex[:6]}")
        slug = kw.pop("slug", None) or name.lower().replace(" ", "-")
        values: dict[str, Any] = {
            "timezone": "UTC",
            "currency": "INR",
            "min_notice_hours": 1,
            "city": "Pune",
        }
        values.update(kw)
        business = Business(
            owner_id=owner.id,
            deposit_percent=20,
            name=name,
            slug=slug,
            **values,
        )
        db.add(business)
        db.commit()
        return business

    return _make


@pytest.fixture
def make_service(db: Session) -> Callable[..., Service]:
    def _make(business: Business, **kw: Any) -> Service:
        values: dict[str, Any] = {"name": "Haircut", "duration_minutes": 60, "price_minor": 10000}
        values.update(kw)
        service = Service(business_id=business.id, **values)
        db.add(service)
        db.commit()
        return service

    return _make


@pytest.fixture
def make_staff(db: Session) -> Callable[..., StaffMember]:
    def _make(
        business: Business,
        services: list[Service] | None = None,
        user: User | None = None,
        name: str = "Alex",
        hours: tuple[time, time] | None = (time(9), time(17)),
    ) -> StaffMember:
        staff = StaffMember(
            business_id=business.id,
            user_id=user.id if user else None,
            display_name=name,
            email=user.email if user else f"s{uuid.uuid4().hex[:8]}@example.com",
        )
        staff.services = list(services or [])
        db.add(staff)
        db.flush()
        if hours is not None:
            for wd in range(7):
                db.add(
                    WorkingHours(
                        staff_id=staff.id, weekday=wd, start_time=hours[0], end_time=hours[1]
                    )
                )
        db.commit()
        return staff

    return _make


@pytest.fixture
def make_booking(db: Session) -> Callable[..., Booking]:
    def _make(
        service: Service,
        staff: StaffMember,
        customer: User,
        start_at: datetime,
        status: BookingStatus = BookingStatus.confirmed,
        paid: bool = True,
        hold_expires_at: datetime | None = None,
    ) -> Booking:
        booking = Booking(
            business_id=service.business_id,
            service_id=service.id,
            staff_id=staff.id,
            customer_id=customer.id,
            start_at=start_at,
            end_at=start_at + timedelta(minutes=service.duration_minutes),
            status=status,
            hold_expires_at=hold_expires_at,
        )
        db.add(booking)
        db.flush()
        business = db.get(Business, service.business_id)
        assert business is not None
        db.add(
            Payment(
                booking_id=booking.id,
                business_id=service.business_id,
                provider="fake",
                provider_payment_id=f"fake_pay_{uuid.uuid4().hex[:10]}",
                amount_minor=2000,
                currency=business.currency,
                status=PaymentStatus.succeeded if paid else PaymentStatus.pending,
            )
        )
        db.commit()
        return booking

    return _make


@dataclass
class World:
    owner: User
    business: Business
    service: Service
    staff: StaffMember
    customer: User
    day: date


@pytest.fixture
def world(
    make_user: Callable[..., User],
    make_business: Callable[..., Business],
    make_service: Callable[..., Service],
    make_staff: Callable[..., StaffMember],
) -> World:
    """One UTC business, one 60-minute service (100.00 INR), one staff 09-17 every day."""
    owner = make_user(role=UserRole.owner, full_name="Owner")
    business = make_business(owner=owner, name="Glow Salon")
    service = make_service(business)
    staff = make_staff(business, [service])
    customer = make_user(full_name="Cara Customer")
    return World(owner, business, service, staff, customer, next_weekday_date(2))


@pytest.fixture
def make_connection(db: Session) -> Callable[..., CalendarConnection]:
    def _make(user: User, staff: StaffMember | None) -> CalendarConnection:
        conn = CalendarConnection(
            user_id=user.id,
            staff_id=staff.id if staff else None,
            google_calendar_id="primary",
            access_token_enc=encrypt_token("access-tok"),
            refresh_token_enc=encrypt_token("refresh-tok"),
            token_expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
        db.add(conn)
        db.commit()
        return conn

    return _make


# --------------------------------------------------------------------------- webhooks


def signed_webhook(
    event_type: str,
    data: dict[str, Any],
    event_id: str | None = None,
    secret: str = WEBHOOK_SECRET,
) -> tuple[bytes, dict[str, str]]:
    body = json.dumps({"type": event_type, "data": data})
    msg_id = event_id or f"evt_{uuid.uuid4().hex}"
    now = datetime.now(UTC)
    signature = Webhook(secret).sign(msg_id, now, body)
    headers = {
        "webhook-id": msg_id,
        "webhook-timestamp": str(int(now.timestamp())),
        "webhook-signature": signature,
        "content-type": "application/json",
    }
    return body.encode(), headers


def post_webhook(
    client: TestClient,
    event_type: str,
    data: dict[str, Any],
    event_id: str | None = None,
) -> Any:
    body, headers = signed_webhook(event_type, data, event_id)
    return client.post("/api/payments/dodo/webhook", content=body, headers=headers)


def book(client: TestClient, w: World, start_at: datetime, user: User | None = None) -> Any:
    return client.post(
        "/api/bookings",
        json={
            "business_id": w.business.id,
            "service_id": w.service.id,
            "start_at": start_at.isoformat(),
        },
        headers=auth(user or w.customer),
    )


def pay(client: TestClient, booking_id: int, payments: FakePaymentProvider) -> Any:
    checkout = next(c for c in payments.checkouts if c["booking_id"] == booking_id)
    return post_webhook(
        client,
        "payment.succeeded",
        {"payment_id": checkout["payment_id"], "metadata": {"booking_id": str(booking_id)}},
    )
