"""Two-way Google Calendar sync.

Push: `push_booking_event(booking_id)` mirrors a booking onto the staff member's calendar.
It opens its own session, logs and swallows every error, and never blocks a booking.
Schedule it via FastAPI BackgroundTasks after confirm / reschedule / cancel / expire.

Retry without extra columns (`retry_pending_pushes`):
  * confirmed, upcoming bookings with google_event_id NULL whose staff has a connection
    -> create the event;
  * cancelled/expired/no_show bookings that still carry a google_event_id -> delete it
    (a successful delete clears google_event_id).

Pull: `refresh_busy_blocks(db, connection)` replaces the connection's CalendarBusyBlocks
with the busy intervals for the next `max_advance_days`, ignoring events SlotEase created.
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import SessionLocal
from app.models import (
    Booking,
    BookingStatus,
    Business,
    CalendarBusyBlock,
    CalendarConnection,
    StaffMember,
)
from app.services import google_calendar as gc
from app.services.token_crypto import decrypt_optional, decrypt_token, encrypt_token

logger = logging.getLogger(__name__)

DEFAULT_SYNC_DAYS = 60
TOKEN_REFRESH_LEEWAY = timedelta(seconds=90)
WATCH_RENEW_BEFORE = timedelta(hours=24)
REMOVE_EVENT_STATUSES: tuple[BookingStatus, ...] = (
    BookingStatus.cancelled,
    BookingStatus.expired,
    BookingStatus.no_show,
)
RETRY_BATCH_LIMIT = 200


# ---------------------------------------------------------------- tokens


def get_access_token(db: Session, connection: CalendarConnection) -> str:
    """Return a valid access token, refreshing (and persisting) it when near expiry."""
    expires_at = connection.token_expires_at
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    needs_refresh = expires_at is not None and expires_at - TOKEN_REFRESH_LEEWAY <= datetime.now(
        UTC
    )
    if not needs_refresh:
        return decrypt_token(connection.access_token_enc)

    refresh_token = decrypt_optional(connection.refresh_token_enc)
    if not refresh_token:
        raise gc.GoogleCalendarError("Access token expired and no refresh token stored", 401)
    tokens = gc.get_google_client().refresh_access_token(refresh_token)
    connection.access_token_enc = encrypt_token(tokens.access_token)
    if tokens.refresh_token and tokens.refresh_token != refresh_token:
        connection.refresh_token_enc = encrypt_token(tokens.refresh_token)
    connection.token_expires_at = tokens.expires_at
    db.commit()
    return tokens.access_token


def _connection_for_staff(db: Session, staff_id: int) -> CalendarConnection | None:
    return db.scalars(
        select(CalendarConnection)
        .where(CalendarConnection.staff_id == staff_id)
        .order_by(CalendarConnection.id.desc())
        .limit(1)
    ).first()


# ---------------------------------------------------------------- push


def _event_body(booking: Booking) -> gc.JSONDict:
    service_name = booking.service.name if booking.service else "Appointment"
    customer = booking.customer
    customer_label = (customer.full_name or customer.email) if customer else "Customer"
    tz = booking.business.timezone if booking.business else "UTC"
    lines = [
        f"Service: {service_name}",
        f"Customer: {customer_label}",
    ]
    if customer is not None:
        lines.append(f"Email: {customer.email}")
    if booking.customer_note:
        lines.append(f"Note: {booking.customer_note}")
    lines.append(f"SlotEase booking #{booking.id}")
    return {
        "summary": f"{service_name} - {customer_label}",
        "description": "\n".join(lines),
        "start": {"dateTime": booking.start_at.isoformat(), "timeZone": tz},
        "end": {"dateTime": booking.end_at.isoformat(), "timeZone": tz},
        "extendedProperties": {"private": {"slotease_booking_id": str(booking.id)}},
        "reminders": {"useDefault": True},
        **_meeting_fields(booking),
    }


def _is_online_meeting(booking: Booking) -> bool:
    """Only businesses listed in MEET_BUSINESS_SLUGS get Google Meet links and client invites."""
    slugs = {x.strip() for x in settings.MEET_BUSINESS_SLUGS.split(",") if x.strip()}
    return booking.business is not None and booking.business.slug in slugs


def _meeting_fields(booking: Booking) -> gc.JSONDict:
    if not _is_online_meeting(booking) or booking.customer is None:
        return {}
    customer = booking.customer
    return {
        "attendees": [
            {"email": customer.email, "displayName": customer.full_name or customer.email}
        ],
        "conferenceData": {
            "createRequest": {
                "requestId": f"slotease-booking-{booking.id}",
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
        "guestsCanModify": False,
    }


def _sync_booking(db: Session, booking: Booking) -> None:
    """Create/patch/delete the Google event for one booking. Raises on Google errors."""
    connection = _connection_for_staff(db, booking.staff_id)
    if connection is None:
        return
    client = gc.get_google_client()
    calendar_id = connection.google_calendar_id

    if booking.status == BookingStatus.confirmed:
        token = get_access_token(db, connection)
        body = _event_body(booking)
        if booking.google_event_id:
            try:
                client.patch_event(token, calendar_id, booking.google_event_id, body)
                logger.info("Patched Google event for booking %s", booking.id)
                return
            except gc.GoogleCalendarError as exc:
                if not exc.is_not_found:
                    raise
                logger.info("Google event for booking %s vanished; recreating", booking.id)
        booking.google_event_id = client.create_event(token, calendar_id, body)
        db.commit()
        logger.info("Created Google event for booking %s", booking.id)
        return

    if booking.status in REMOVE_EVENT_STATUSES and booking.google_event_id:
        token = get_access_token(db, connection)
        try:
            client.delete_event(token, calendar_id, booking.google_event_id)
        except gc.GoogleCalendarError as exc:
            if not exc.is_not_found:
                raise
        booking.google_event_id = None
        db.commit()
        logger.info("Deleted Google event for booking %s", booking.id)


def _load_booking(db: Session, booking_id: int) -> Booking | None:
    return db.scalars(
        select(Booking)
        .options(
            joinedload(Booking.service), joinedload(Booking.customer), joinedload(Booking.business)
        )
        .where(Booking.id == booking_id)
    ).first()


def push_booking_event(booking_id: int) -> None:
    """Mirror booking `booking_id` to Google. Never raises (safe for BackgroundTasks)."""
    try:
        with SessionLocal() as db:
            booking = _load_booking(db, booking_id)
            if booking is None:
                logger.warning("push_booking_event: booking %s not found", booking_id)
                return
            _sync_booking(db, booking)
    except Exception:
        logger.exception("Google Calendar push failed for booking %s (will retry)", booking_id)


def retry_pending_pushes(db: Session, now: datetime | None = None) -> int:
    """Retry pushes that never landed. Returns the number of bookings attempted."""
    now = now or datetime.now(UTC)
    connected_staff = select(CalendarConnection.staff_id).where(
        CalendarConnection.staff_id.is_not(None)
    )
    missing_create = select(Booking.id).where(
        Booking.status == BookingStatus.confirmed,
        Booking.google_event_id.is_(None),
        Booking.end_at > now,
        Booking.staff_id.in_(connected_staff),
    )
    missing_delete = select(Booking.id).where(
        Booking.status.in_(REMOVE_EVENT_STATUSES),
        Booking.google_event_id.is_not(None),
        Booking.staff_id.in_(connected_staff),
    )
    ids = list(db.scalars(missing_create.limit(RETRY_BATCH_LIMIT)))
    ids += list(db.scalars(missing_delete.limit(RETRY_BATCH_LIMIT)))
    db.rollback()  # release the read snapshot; each push uses its own session
    for booking_id in ids:
        push_booking_event(booking_id)
    if ids:
        logger.info("Retried Google Calendar push for %d booking(s)", len(ids))
    return len(ids)


# ---------------------------------------------------------------- pull


def _sync_window_days(db: Session, connection: CalendarConnection) -> int:
    if connection.staff_id is None:
        return DEFAULT_SYNC_DAYS
    days = db.scalar(
        select(Business.max_advance_days)
        .join(StaffMember, StaffMember.business_id == Business.id)
        .where(StaffMember.id == connection.staff_id)
    )
    return int(days) if days else DEFAULT_SYNC_DAYS


def refresh_busy_blocks(db: Session, connection: CalendarConnection) -> int:
    """Replace the connection's busy blocks from Google. Returns blocks stored.

    Uses events.list rather than freebusy because freebusy carries no event ids and we
    must skip the events SlotEase itself pushed (matched on google_event_id or the
    `slotease_booking_id` private extended property).
    """
    now = datetime.now(UTC)
    time_max = now + timedelta(days=_sync_window_days(db, connection) + 1)
    token = get_access_token(db, connection)
    events = gc.get_google_client().list_events(token, connection.google_calendar_id, now, time_max)

    candidate_ids = {e.id for e in events if e.id}
    own_ids: set[str] = set()
    if candidate_ids:
        own_ids = {
            eid
            for eid in db.scalars(
                select(Booking.google_event_id).where(Booking.google_event_id.in_(candidate_ids))
            )
            if eid
        }

    db.execute(delete(CalendarBusyBlock).where(CalendarBusyBlock.connection_id == connection.id))
    stored = 0
    for event in events:
        if event.id in own_ids or event.slotease_booking_id:
            continue
        db.add(
            CalendarBusyBlock(
                connection_id=connection.id,
                start_at=max(event.start_at, now),
                end_at=event.end_at,
                synced_at=now,
            )
        )
        stored += 1
    db.commit()
    logger.info("Refreshed %d busy block(s) for calendar connection %s", stored, connection.id)
    return stored


def refresh_connection(connection_id: int) -> None:
    """Refresh one connection in its own session. Never raises (BackgroundTasks-safe)."""
    try:
        with SessionLocal() as db:
            connection = db.get(CalendarConnection, connection_id)
            if connection is not None:
                refresh_busy_blocks(db, connection)
    except Exception:
        logger.exception("Busy-block refresh failed for calendar connection %s", connection_id)


def refresh_all_busy_blocks(db: Session) -> int:
    """Scheduler fallback: refresh every connection. Returns connections refreshed."""
    ids = list(db.scalars(select(CalendarConnection.id)))
    db.rollback()
    for connection_id in ids:
        refresh_connection(connection_id)
    return len(ids)


# ---------------------------------------------------------------- watches


def stop_watch(db: Session, connection: CalendarConnection) -> None:
    """Stop the connection's push channel (errors logged) and clear watch fields."""
    if connection.watch_channel_id and connection.watch_resource_id:
        try:
            token = get_access_token(db, connection)
            gc.get_google_client().stop_channel(
                token, connection.watch_channel_id, connection.watch_resource_id
            )
        except Exception:
            logger.warning(
                "Failed to stop watch channel for connection %s", connection.id, exc_info=True
            )
    connection.watch_channel_id = None
    connection.watch_resource_id = None
    connection.watch_expires_at = None


def create_watch(db: Session, connection: CalendarConnection) -> bool:
    """(Re)create the events.watch channel. Returns False when push is unsupported."""
    if not gc.watch_supported():
        logger.debug("Skipping events.watch: BACKEND_URL is not public HTTPS")
        return False
    stop_watch(db, connection)
    token = get_access_token(db, connection)
    channel_id = uuid.uuid4().hex
    channel = gc.get_google_client().watch_events(
        token,
        connection.google_calendar_id,
        channel_id,
        gc.channel_token_for(channel_id),
        gc.notifications_address(),
    )
    connection.watch_channel_id = channel.channel_id
    connection.watch_resource_id = channel.resource_id
    connection.watch_expires_at = channel.expires_at
    db.commit()
    logger.info("Created watch channel for connection %s", connection.id)
    return True


def renew_watches(db: Session) -> int:
    """Renew channels that are missing or expire within 24h. Returns channels renewed."""
    if not gc.watch_supported():
        return 0
    cutoff = datetime.now(UTC) + WATCH_RENEW_BEFORE
    connections = list(
        db.scalars(
            select(CalendarConnection).where(
                (CalendarConnection.watch_expires_at.is_(None))
                | (CalendarConnection.watch_expires_at < cutoff)
            )
        )
    )
    renewed = 0
    for connection in connections:
        try:
            if create_watch(db, connection):
                renewed += 1
        except Exception:
            db.rollback()
            logger.exception("Failed to renew watch for connection %s", connection.id)
    return renewed


def calendar_sync_enabled() -> bool:
    return bool(settings.GOOGLE_CLIENT_ID and settings.TOKEN_ENCRYPTION_KEY)
