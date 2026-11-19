"""Shared FastAPI dependencies and tenant-permission helpers.

Permission helpers (plain functions, call them from services/routers):
    get_owned_business(db, user, business_id) -> Business
    require_business_member(db, user, business_id) -> (Business, StaffMember | None)
Both raise NotFoundError (no such business) or ForbiddenError (not allowed).
"""

from fastapi import Depends, Query, WebSocketException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import decode_access_token
from app.database import SessionLocal, get_db
from app.exceptions import ForbiddenError, NotFoundError, UnauthorizedError
from app.models import Business, StaffMember, User

__all__ = [
    "get_db",
    "get_current_user",
    "get_current_user_optional",
    "get_owned_business",
    "get_ws_user",
    "oauth2_scheme",
    "require_business_member",
    "user_from_token",
]

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def user_from_token(db: Session, token: str | None) -> User | None:
    """Resolve an access token to an active user, or None."""
    if not token:
        return None
    payload = decode_access_token(token)
    if payload is None:
        return None
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        return None
    return user


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Return the authenticated user (Bearer JWT) or raise 401."""
    if not token:
        raise UnauthorizedError("Authentication required")
    user = user_from_token(db, token)
    if user is None:
        raise UnauthorizedError("Invalid or expired token")
    return user


async def get_current_user_optional(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """Return the user if a valid token is present, else None (never raises)."""
    return user_from_token(db, token)


async def get_ws_user(token: str = Query(...)) -> User:
    """WebSocket auth via `?token=<access JWT>`; closes with 1008 when invalid.

    Uses its own short-lived session; the returned User is detached (scalar
    attributes stay loaded, relationships are not available).
    """
    with SessionLocal() as db:
        user = user_from_token(db, token)
    if user is None:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized")
    return user


# ---------------------------------------------------------------- permissions


def _load_business(db: Session, business_id: int) -> Business:
    business = db.get(Business, business_id)
    if business is None:
        raise NotFoundError("Business not found")
    return business


def get_owned_business(db: Session, user: User, business_id: int) -> Business:
    """Return the business if `user` owns it."""
    business = _load_business(db, business_id)
    if business.owner_id != user.id:
        raise ForbiddenError("You do not own this business")
    return business


def require_business_member(
    db: Session, user: User, business_id: int
) -> tuple[Business, StaffMember | None]:
    """Owner -> (business, None); active staff -> (business, staff); else 403."""
    business = _load_business(db, business_id)
    if business.owner_id == user.id:
        return business, None
    staff = db.scalar(
        select(StaffMember).where(
            StaffMember.business_id == business_id,
            StaffMember.user_id == user.id,
            StaffMember.is_active.is_(True),
        )
    )
    if staff is None:
        raise ForbiddenError("You are not a member of this business")
    return business, staff
