"""Password hashing, JWT access tokens and DB-backed refresh tokens.

Refresh tokens are opaque random strings. Only their SHA-256 hash is stored, and each
use rotates the token. Presenting a token that was already revoked is treated as a
replay: every refresh token of that user is revoked. Exception: a token that was rotated
less than REFRESH_REUSE_GRACE_SECONDS ago (e.g. two tabs refreshing at once) gets a new
token in the same family, provided the family still has a live token.
"""

import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import settings
from app.exceptions import UnauthorizedError
from app.models import RefreshToken, User

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ACCESS_TOKEN_TYPE = "access"
WS_TICKET_TYPE = "ws"
WS_TICKET_TTL_SECONDS = 60
REFRESH_REUSE_GRACE_SECONDS = 30


# ---------------------------------------------------------------- passwords


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return pwd_context.verify(plain, hashed)
    except (ValueError, TypeError):
        logger.warning("Password hash could not be verified (malformed hash)")
        return False


# ---------------------------------------------------------------- access tokens


def create_access_token(user_id: int, extra_claims: dict[str, Any] | None = None) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        **(extra_claims or {}),
        "sub": str(user_id),
        "type": ACCESS_TOKEN_TYPE,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Return the claims of a valid access token, or None."""
    try:
        payload: dict[str, Any] = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
    except JWTError:
        return None
    if payload.get("type") != ACCESS_TOKEN_TYPE or not str(payload.get("sub", "")).isdigit():
        return None
    return payload


# ---------------------------------------------------------------- WebSocket tickets


def create_ws_ticket(user_id: int, business_id: int) -> tuple[str, int]:
    """Short-lived, single-use JWT for the dashboard socket. Returns (ticket, ttl_s)."""
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "type": WS_TICKET_TYPE,
        "business_id": business_id,
        "jti": secrets.token_urlsafe(16),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=WS_TICKET_TTL_SECONDS)).timestamp()),
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return token, WS_TICKET_TTL_SECONDS


def decode_ws_ticket(ticket: str) -> dict[str, Any] | None:
    """Return the claims of a valid (signed, unexpired, type "ws") ticket, or None."""
    try:
        payload: dict[str, Any] = jwt.decode(
            ticket, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
    except JWTError:
        return None
    if (
        payload.get("type") != WS_TICKET_TYPE
        or not str(payload.get("sub", "")).isdigit()
        or not isinstance(payload.get("business_id"), int)
        or not isinstance(payload.get("jti"), str)
        or not isinstance(payload.get("exp"), int)
    ):
        return None
    return payload


# ---------------------------------------------------------------- refresh tokens


def hash_token(token: str) -> str:
    """SHA-256 hex digest used to store refresh and invite tokens."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_refresh_token(db: Session, user: User, family_id: str | None = None) -> str:
    """Persist a new refresh token (hash only) and return the raw value. Caller commits.

    A new login starts a new family; rotations pass the family of the rotated token.
    """
    raw = secrets.token_urlsafe(48)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(raw),
            family_id=family_id or secrets.token_hex(16),
            expires_at=datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    db.flush()
    return raw


def revoke_all_refresh_tokens(db: Session, user_id: int) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


def rotate_refresh_token(db: Session, raw_token: str) -> tuple[User, str]:
    """Revoke `raw_token` and issue a new one. Caller commits.

    Raises UnauthorizedError for unknown, expired or revoked tokens and inactive users.
    """
    record = db.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_token(raw_token))
        .with_for_update()
    )
    if record is None:
        raise UnauthorizedError("Invalid refresh token")
    now = datetime.now(UTC)
    if record.revoked_at is not None:
        if _in_rotation_grace(db, record, now):
            user = db.get(User, record.user_id)
            if user is None or not user.is_active:
                raise UnauthorizedError("Invalid refresh token")
            logger.info("Refresh token reused within grace window for user_id=%s", user.id)
            return user, create_refresh_token(db, user, record.family_id)
        logger.warning("Revoked refresh token reused for user_id=%s; revoking all", record.user_id)
        revoke_all_refresh_tokens(db, record.user_id)
        db.commit()
        raise UnauthorizedError("Invalid refresh token")
    if record.expires_at <= now:
        raise UnauthorizedError("Refresh token expired")
    user = db.get(User, record.user_id)
    if user is None or not user.is_active:
        raise UnauthorizedError("Invalid refresh token")
    record.revoked_at = now
    record.rotated_at = now
    if record.family_id is None:  # tokens issued before families existed
        record.family_id = secrets.token_hex(16)
    return user, create_refresh_token(db, user, record.family_id)


def _in_rotation_grace(db: Session, record: RefreshToken, now: datetime) -> bool:
    """True if `record` was rotated (not logged out / revoked) within the grace window
    and its family still has a live token (so logout / revoke-all are not bypassed)."""
    if record.rotated_at is None or record.family_id is None or record.expires_at <= now:
        return False
    if now - record.rotated_at > timedelta(seconds=REFRESH_REUSE_GRACE_SECONDS):
        return False
    live = db.scalar(
        select(RefreshToken.id)
        .where(
            RefreshToken.family_id == record.family_id,
            RefreshToken.user_id == record.user_id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
        )
        .limit(1)
    )
    return live is not None


def revoke_refresh_token(db: Session, raw_token: str) -> None:
    """Revoke one refresh token if it exists. Caller commits."""
    record = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token)))
    if record is not None and record.revoked_at is None:
        record.revoked_at = datetime.now(UTC)
