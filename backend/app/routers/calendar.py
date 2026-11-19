"""Google Calendar sync endpoints. Mounted with prefix="/api/calendar"."""

import logging
from urllib.parse import urlencode

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Cookie,
    Depends,
    Header,
    Query,
    Response,
    status,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal, get_db
from app.dependencies import get_current_user
from app.exceptions import AppError, ForbiddenError, NotFoundError
from app.models import CalendarBusyBlock, CalendarConnection, StaffMember, User, UserRole
from app.schemas.calendar import CalendarConnectResponse, CalendarStatusResponse
from app.services import calendar_sync
from app.services import google_calendar as gc
from app.services.token_crypto import encrypt_token

logger = logging.getLogger(__name__)

router = APIRouter()

SETTINGS_PATH = "/settings/calendar"
STATE_COOKIE = "slotease_gcal_state"
STATE_COOKIE_PATH = "/api/calendar/google/callback"


def _frontend_redirect(result: str, reason: str | None = None) -> RedirectResponse:
    params = {"connected": "1"} if result == "connected" else {"error": reason or result}
    url = f"{settings.FRONTEND_URL.rstrip('/')}{SETTINGS_PATH}?{urlencode(params)}"
    return RedirectResponse(url=url, status_code=status.HTTP_302_FOUND)


def _staff_for_user(db: Session, user_id: int) -> StaffMember | None:
    return db.scalars(
        select(StaffMember)
        .where(StaffMember.user_id == user_id, StaffMember.is_active.is_(True))
        .order_by(StaffMember.id)
        .limit(1)
    ).first()


def _user_connection(db: Session, user_id: int) -> CalendarConnection | None:
    return db.scalars(
        select(CalendarConnection)
        .where(CalendarConnection.user_id == user_id)
        .order_by(CalendarConnection.id.desc())
        .limit(1)
    ).first()


def _ensure_configured() -> None:
    if not calendar_sync.calendar_sync_enabled():
        raise AppError(
            "Google Calendar sync is not configured",
            code="CALENDAR_NOT_CONFIGURED",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


def _complete_connect(db: Session, user_id: int, code: str) -> int:
    """Exchange the code, upsert the connection, create the watch. Returns connection id."""
    tokens = gc.get_google_client().exchange_code(code)
    staff = _staff_for_user(db, user_id)

    connection = _user_connection(db, user_id)
    if connection is None:
        connection = CalendarConnection(
            user_id=user_id,
            google_calendar_id="primary",
            access_token_enc=encrypt_token(tokens.access_token),
        )
        db.add(connection)
    else:
        calendar_sync.stop_watch(db, connection)
        connection.access_token_enc = encrypt_token(tokens.access_token)
    if tokens.refresh_token:
        connection.refresh_token_enc = encrypt_token(tokens.refresh_token)
    connection.token_expires_at = tokens.expires_at
    connection.staff_id = staff.id if staff else None
    db.commit()

    try:
        calendar_sync.create_watch(db, connection)
    except Exception:
        db.rollback()
        logger.exception("Could not create watch for connection %s", connection.id)
    return connection.id


@router.get("/google/connect", response_model=CalendarConnectResponse)
async def google_connect(
    response: Response, user: User = Depends(get_current_user)
) -> CalendarConnectResponse:
    """Start the calendar OAuth flow (owners and staff only).

    The state is bound to this browser via a random nonce kept in an httpOnly cookie
    scoped to the callback path, so a forged callback link cannot attach a calendar.
    """
    _ensure_configured()
    if user.role not in (UserRole.owner, UserRole.staff):
        raise ForbiddenError("Only business owners and staff can connect a calendar")
    nonce = gc.new_browser_nonce()
    response.set_cookie(
        STATE_COOKIE,
        nonce,
        max_age=gc.STATE_TTL_MINUTES * 60,
        path=STATE_COOKIE_PATH,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
    )
    state = gc.create_oauth_state(user.id, browser_nonce=nonce)
    return CalendarConnectResponse(url=gc.get_google_client().build_auth_url(state))


@router.get("/google/callback", include_in_schema=False)
async def google_callback(
    background_tasks: BackgroundTasks,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    state_cookie: str | None = Cookie(default=None, alias=STATE_COOKIE),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Google redirects the browser here; the user is identified by the signed state,
    which must match the nonce cookie set by /connect in this browser."""
    redirect = await _handle_callback(background_tasks, code, state, error, state_cookie, db)
    redirect.delete_cookie(
        STATE_COOKIE,
        path=STATE_COOKIE_PATH,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
    )
    return redirect


async def _handle_callback(
    background_tasks: BackgroundTasks,
    code: str | None,
    state: str | None,
    error: str | None,
    state_cookie: str | None,
    db: Session,
) -> RedirectResponse:
    if error:
        logger.info("Google calendar consent not granted: %s", error)
        return _frontend_redirect("error", "access_denied")
    if not code or not state:
        return _frontend_redirect("error", "missing_code")
    try:
        user_id = gc.verify_oauth_state(state, browser_nonce=state_cookie or "")
    except gc.GoogleCalendarError:
        return _frontend_redirect("error", "invalid_state")
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        return _frontend_redirect("error", "invalid_user")

    try:
        connection_id = await run_in_threadpool(_complete_connect, db, user_id, code)
    except Exception:
        db.rollback()
        logger.exception("Google calendar connect failed for user %s", user_id)
        return _frontend_redirect("error", "exchange_failed")

    # Initial pull + push of upcoming bookings happen after the redirect is sent.
    background_tasks.add_task(calendar_sync.refresh_connection, connection_id)
    background_tasks.add_task(_initial_push, connection_id)
    return _frontend_redirect("connected")


def _initial_push(connection_id: int) -> None:
    try:
        with SessionLocal() as db:
            calendar_sync.retry_pending_pushes(db)
    except Exception:
        logger.exception("Initial booking push failed for connection %s", connection_id)


def _disconnect(db: Session, user_id: int) -> bool:
    connections = list(
        db.scalars(select(CalendarConnection).where(CalendarConnection.user_id == user_id))
    )
    if not connections:
        return False
    for connection in connections:
        calendar_sync.stop_watch(db, connection)
        db.delete(connection)  # busy blocks cascade
    db.commit()
    return True


@router.delete("/google", status_code=status.HTTP_204_NO_CONTENT)
async def google_disconnect(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Response:
    """Disconnect: stop the watch channel and delete stored tokens + busy blocks."""
    removed = await run_in_threadpool(_disconnect, db, user.id)
    if not removed:
        raise NotFoundError("No Google Calendar connection")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/google/status", response_model=CalendarStatusResponse)
async def google_status(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> CalendarStatusResponse:
    connection = _user_connection(db, user.id)
    if connection is None:
        return CalendarStatusResponse(connected=False)
    count, last_synced = db.execute(
        select(func.count(CalendarBusyBlock.id), func.max(CalendarBusyBlock.synced_at)).where(
            CalendarBusyBlock.connection_id == connection.id
        )
    ).one()
    return CalendarStatusResponse(
        connected=True,
        calendar_id=connection.google_calendar_id,
        staff_id=connection.staff_id,
        watch_active=connection.watch_channel_id is not None,
        watch_expires_at=connection.watch_expires_at,
        last_synced_at=last_synced or connection.updated_at,
        busy_block_count=int(count or 0),
        connected_at=connection.created_at,
    )


@router.post("/google/notifications", include_in_schema=False)
async def google_notifications(
    background_tasks: BackgroundTasks,
    channel_id: str | None = Header(default=None, alias="X-Goog-Channel-ID"),
    channel_token: str | None = Header(default=None, alias="X-Goog-Channel-Token"),
    resource_state: str | None = Header(default=None, alias="X-Goog-Resource-State"),
    db: Session = Depends(get_db),
) -> Response:
    """Google push webhook: validate the channel token, then refresh busy blocks."""
    if not channel_id or not gc.verify_channel_token(channel_id, channel_token):
        raise ForbiddenError("Invalid channel token")
    connection = db.scalars(
        select(CalendarConnection).where(CalendarConnection.watch_channel_id == channel_id)
    ).first()
    if connection is None:
        # Stale channel (e.g. after disconnect). 200 so Google stops retrying.
        logger.info("Notification for unknown channel %s ignored", channel_id)
        return Response(status_code=status.HTTP_200_OK)
    if resource_state != "sync":  # "sync" is the handshake sent when a watch starts
        background_tasks.add_task(calendar_sync.refresh_connection, connection.id)
    return Response(status_code=status.HTTP_200_OK)
