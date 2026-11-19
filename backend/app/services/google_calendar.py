"""Google Calendar API client (OAuth + events + freebusy + push channels).

Everything goes through the `GoogleCalendarClient` protocol so tests can swap in a fake:

    from app.services import google_calendar
    google_calendar.set_google_client(FakeClient())

The default implementation uses synchronous httpx; call it from sync code / threadpools.
"""

import hashlib
import hmac
import logging
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol
from urllib.parse import quote, urlencode

import httpx
from jose import JWTError, jwt

from app.config import settings

logger = logging.getLogger(__name__)

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
API_BASE = "https://www.googleapis.com/calendar/v3"
SCOPES: tuple[str, ...] = (
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
)
STATE_PURPOSE = "gcal_connect"
STATE_TTL_MINUTES = 10
HTTP_TIMEOUT_SECONDS = 15.0

JSONDict = dict[str, Any]


class GoogleCalendarError(Exception):
    """Any failure talking to Google. `status_code` is the HTTP status when known."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code

    @property
    def is_not_found(self) -> bool:
        return self.status_code in (404, 410)

    @property
    def is_auth_error(self) -> bool:
        return self.status_code in (400, 401)


@dataclass(frozen=True)
class OAuthTokens:
    access_token: str
    refresh_token: str | None
    expires_at: datetime | None


@dataclass(frozen=True)
class WatchChannel:
    channel_id: str
    resource_id: str
    expires_at: datetime | None


@dataclass(frozen=True)
class CalendarEvent:
    """A busy-relevant event from events.list (times are tz-aware UTC)."""

    id: str
    start_at: datetime
    end_at: datetime
    slotease_booking_id: str | None


# ---------------------------------------------------------------- OAuth state


def new_browser_nonce() -> str:
    """Random value stored in an httpOnly cookie and bound into the OAuth state."""
    return secrets.token_urlsafe(24)


def create_oauth_state(user_id: int, browser_nonce: str = "") -> str:
    """Signed, short-lived state carrying the user id and the browser-bound nonce."""
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "purpose": STATE_PURPOSE,
        "nonce": secrets.token_urlsafe(12),
        "bn": browser_nonce,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=STATE_TTL_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_oauth_state(state: str, browser_nonce: str | None = None) -> int:
    """Return the user id from a valid state, else raise GoogleCalendarError.

    When `browser_nonce` is given (the callback always passes the cookie value), it must
    be non-empty and match the nonce bound into the state (constant-time compare).
    """
    try:
        payload = jwt.decode(state, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError as exc:
        raise GoogleCalendarError("Invalid or expired OAuth state") from exc
    if payload.get("purpose") != STATE_PURPOSE or not str(payload.get("sub", "")).isdigit():
        raise GoogleCalendarError("Invalid OAuth state")
    if browser_nonce is not None:
        bound = str(payload.get("bn") or "")
        if not browser_nonce or not bound or not hmac.compare_digest(bound, browser_nonce):
            raise GoogleCalendarError("OAuth state is not bound to this browser")
    return int(payload["sub"])


def channel_token_for(channel_id: str) -> str:
    """Deterministic HMAC token sent with events.watch and echoed in X-Goog-Channel-Token."""
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"), channel_id.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def verify_channel_token(channel_id: str, token: str | None) -> bool:
    if not token:
        return False
    return hmac.compare_digest(channel_token_for(channel_id), token)


def notifications_address() -> str:
    return f"{settings.BACKEND_URL.rstrip('/')}/api/calendar/google/notifications"


def watch_supported() -> bool:
    """Google only delivers push notifications to public HTTPS URLs."""
    return settings.BACKEND_URL.startswith("https://")


# ---------------------------------------------------------------- interface


class GoogleCalendarClient(Protocol):
    def build_auth_url(self, state: str) -> str: ...

    def exchange_code(self, code: str) -> OAuthTokens: ...

    def refresh_access_token(self, refresh_token: str) -> OAuthTokens: ...

    def revoke_token(self, token: str) -> None: ...

    def create_event(self, access_token: str, calendar_id: str, body: JSONDict) -> str: ...

    def patch_event(
        self, access_token: str, calendar_id: str, event_id: str, body: JSONDict
    ) -> None: ...

    def delete_event(self, access_token: str, calendar_id: str, event_id: str) -> None: ...

    def list_events(
        self, access_token: str, calendar_id: str, time_min: datetime, time_max: datetime
    ) -> list[CalendarEvent]: ...

    def freebusy(
        self, access_token: str, calendar_id: str, time_min: datetime, time_max: datetime
    ) -> list[tuple[datetime, datetime]]: ...

    def watch_events(
        self, access_token: str, calendar_id: str, channel_id: str, token: str, address: str
    ) -> WatchChannel: ...

    def stop_channel(self, access_token: str, channel_id: str, resource_id: str) -> None: ...


# ---------------------------------------------------------------- helpers


def _rfc3339(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _parse_dt(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _parse_event_time(part: JSONDict, tz_name: str | None) -> datetime | None:
    if "dateTime" in part:
        return _parse_dt(str(part["dateTime"]))
    if "date" in part:  # all-day event: midnight in the calendar's timezone
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        try:
            tz = ZoneInfo(tz_name or "UTC")
        except ZoneInfoNotFoundError:
            tz = ZoneInfo("UTC")
        day = datetime.fromisoformat(str(part["date"]))
        return day.replace(tzinfo=tz).astimezone(UTC)
    return None


def _expiry(expires_in: object) -> datetime | None:
    if isinstance(expires_in, int | float):
        return datetime.now(UTC) + timedelta(seconds=int(expires_in))
    return None


# ---------------------------------------------------------------- httpx impl


class HttpxGoogleCalendarClient:
    """Default client backed by synchronous httpx."""

    def __init__(self, timeout: float = HTTP_TIMEOUT_SECONDS) -> None:
        self._timeout = timeout

    # -- low level
    def _request(
        self,
        method: str,
        url: str,
        *,
        access_token: str | None = None,
        json: JSONDict | None = None,
        params: dict[str, str] | None = None,
        data: dict[str, str] | None = None,
    ) -> JSONDict:
        headers = {"Authorization": f"Bearer {access_token}"} if access_token else {}
        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.request(
                    method, url, headers=headers, json=json, params=params, data=data
                )
        except httpx.HTTPError as exc:
            raise GoogleCalendarError(f"Google request failed: {exc.__class__.__name__}") from exc
        if resp.status_code >= 400:
            # Never log the body of token endpoints verbatim beyond the error field.
            detail = ""
            try:
                err = resp.json().get("error")
                detail = err if isinstance(err, str) else str((err or {}).get("message", ""))
            except ValueError:
                detail = resp.text[:200]
            raise GoogleCalendarError(
                f"Google API {method} {url.split('?')[0]} -> {resp.status_code}: {detail}",
                status_code=resp.status_code,
            )
        if resp.status_code == 204 or not resp.content:
            return {}
        try:
            body = resp.json()
        except ValueError as exc:
            raise GoogleCalendarError("Google returned non-JSON response") from exc
        return body if isinstance(body, dict) else {}

    def _cal_url(self, calendar_id: str, suffix: str = "") -> str:
        return f"{API_BASE}/calendars/{quote(calendar_id, safe='')}{suffix}"

    # -- OAuth
    def build_auth_url(self, state: str) -> str:
        params = {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": settings.GOOGLE_CALENDAR_REDIRECT_URI,
            "response_type": "code",
            "scope": " ".join(SCOPES),
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
            "state": state,
        }
        return f"{AUTH_URL}?{urlencode(params)}"

    def exchange_code(self, code: str) -> OAuthTokens:
        body = self._request(
            "POST",
            TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_CALENDAR_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        access = body.get("access_token")
        if not isinstance(access, str):
            raise GoogleCalendarError("Token exchange returned no access_token")
        refresh = body.get("refresh_token")
        return OAuthTokens(
            access_token=access,
            refresh_token=refresh if isinstance(refresh, str) else None,
            expires_at=_expiry(body.get("expires_in")),
        )

    def refresh_access_token(self, refresh_token: str) -> OAuthTokens:
        body = self._request(
            "POST",
            TOKEN_URL,
            data={
                "refresh_token": refresh_token,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "grant_type": "refresh_token",
            },
        )
        access = body.get("access_token")
        if not isinstance(access, str):
            raise GoogleCalendarError("Token refresh returned no access_token")
        new_refresh = body.get("refresh_token")
        return OAuthTokens(
            access_token=access,
            refresh_token=new_refresh if isinstance(new_refresh, str) else refresh_token,
            expires_at=_expiry(body.get("expires_in")),
        )

    def revoke_token(self, token: str) -> None:
        self._request("POST", REVOKE_URL, data={"token": token})

    # -- events
    def create_event(self, access_token: str, calendar_id: str, body: JSONDict) -> str:
        created = self._request(
            "POST", self._cal_url(calendar_id, "/events"), access_token=access_token, json=body
        )
        event_id = created.get("id")
        if not isinstance(event_id, str):
            raise GoogleCalendarError("events.insert returned no id")
        return event_id

    def patch_event(
        self, access_token: str, calendar_id: str, event_id: str, body: JSONDict
    ) -> None:
        self._request(
            "PATCH",
            self._cal_url(calendar_id, f"/events/{quote(event_id, safe='')}"),
            access_token=access_token,
            json=body,
        )

    def delete_event(self, access_token: str, calendar_id: str, event_id: str) -> None:
        self._request(
            "DELETE",
            self._cal_url(calendar_id, f"/events/{quote(event_id, safe='')}"),
            access_token=access_token,
        )

    def list_events(
        self, access_token: str, calendar_id: str, time_min: datetime, time_max: datetime
    ) -> list[CalendarEvent]:
        events: list[CalendarEvent] = []
        page_token: str | None = None
        while True:
            params = {
                "timeMin": _rfc3339(time_min),
                "timeMax": _rfc3339(time_max),
                "singleEvents": "true",
                "showDeleted": "false",
                "maxResults": "2500",
            }
            if page_token:
                params["pageToken"] = page_token
            body = self._request(
                "GET",
                self._cal_url(calendar_id, "/events"),
                access_token=access_token,
                params=params,
            )
            tz_name = body.get("timeZone")
            for item in body.get("items", []):
                if not isinstance(item, dict) or item.get("status") == "cancelled":
                    continue
                if item.get("transparency") == "transparent":  # "free" events don't block
                    continue
                start = _parse_event_time(item.get("start") or {}, tz_name)
                end = _parse_event_time(item.get("end") or {}, tz_name)
                if start is None or end is None or end <= start:
                    continue
                private = (item.get("extendedProperties") or {}).get("private") or {}
                events.append(
                    CalendarEvent(
                        id=str(item.get("id", "")),
                        start_at=start,
                        end_at=end,
                        slotease_booking_id=private.get("slotease_booking_id"),
                    )
                )
            page_token = body.get("nextPageToken")
            if not page_token:
                return events

    def freebusy(
        self, access_token: str, calendar_id: str, time_min: datetime, time_max: datetime
    ) -> list[tuple[datetime, datetime]]:
        body = self._request(
            "POST",
            f"{API_BASE}/freeBusy",
            access_token=access_token,
            json={
                "timeMin": _rfc3339(time_min),
                "timeMax": _rfc3339(time_max),
                "items": [{"id": calendar_id}],
            },
        )
        cal = (body.get("calendars") or {}).get(calendar_id) or {}
        if cal.get("errors"):
            raise GoogleCalendarError(f"freebusy error: {cal['errors']}")
        return [
            (_parse_dt(b["start"]), _parse_dt(b["end"]))
            for b in cal.get("busy", [])
            if isinstance(b, dict) and "start" in b and "end" in b
        ]

    # -- push channels
    def watch_events(
        self, access_token: str, calendar_id: str, channel_id: str, token: str, address: str
    ) -> WatchChannel:
        body = self._request(
            "POST",
            self._cal_url(calendar_id, "/events/watch"),
            access_token=access_token,
            json={"id": channel_id, "type": "web_hook", "address": address, "token": token},
        )
        resource_id = body.get("resourceId")
        if not isinstance(resource_id, str):
            raise GoogleCalendarError("events.watch returned no resourceId")
        expiration = body.get("expiration")
        expires_at = datetime.fromtimestamp(int(expiration) / 1000, tz=UTC) if expiration else None
        return WatchChannel(channel_id=channel_id, resource_id=resource_id, expires_at=expires_at)

    def stop_channel(self, access_token: str, channel_id: str, resource_id: str) -> None:
        self._request(
            "POST",
            f"{API_BASE}/channels/stop",
            access_token=access_token,
            json={"id": channel_id, "resourceId": resource_id},
        )


# ---------------------------------------------------------------- registry

_client: GoogleCalendarClient | None = None


def get_google_client() -> GoogleCalendarClient:
    global _client
    if _client is None:
        _client = HttpxGoogleCalendarClient()
    return _client


def set_google_client(client: GoogleCalendarClient | None) -> None:
    """Override the client (tests). Pass None to restore the default."""
    global _client
    _client = client
