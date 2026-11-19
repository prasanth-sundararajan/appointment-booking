"""Registration, login, token issuing and Google account linking."""

import logging

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.google_login import GoogleUserInfo
from app.auth.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    revoke_refresh_token,
    rotate_refresh_token,
    verify_password,
)
from app.exceptions import ConflictError, UnauthorizedError
from app.models import Business, StaffMember, User, UserRole
from app.schemas.auth import RegisterRequest
from app.schemas.user import BusinessSummary, MeResponse, StaffMembership, UserRead, UserUpdate

logger = logging.getLogger(__name__)

# Constant-cost dummy hash so unknown emails take as long as wrong passwords.
_DUMMY_HASH = hash_password("timing-equaliser-not-a-real-password")


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(func.lower(User.email) == email.lower()))


def register_user(db: Session, data: RegisterRequest) -> User:
    if get_user_by_email(db, data.email) is not None:
        raise ConflictError("An account with this email already exists", code="EMAIL_TAKEN")
    user = User(
        email=data.email.lower(),
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role=UserRole(data.role),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError(
            "An account with this email already exists", code="EMAIL_TAKEN"
        ) from exc
    db.refresh(user)
    logger.info("User registered id=%s role=%s", user.id, user.role.value)
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    user = get_user_by_email(db, email.strip())
    if user is None:
        verify_password(password, _DUMMY_HASH)
        raise UnauthorizedError("Invalid email or password")
    if not verify_password(password, user.hashed_password) or not user.is_active:
        raise UnauthorizedError("Invalid email or password")
    return user


def issue_tokens(db: Session, user: User) -> tuple[str, str]:
    """Return (access_token, raw_refresh_token) and commit the refresh record."""
    refresh = create_refresh_token(db, user)
    db.commit()
    return create_access_token(user.id), refresh


def refresh_tokens(db: Session, raw_refresh: str | None) -> tuple[User, str, str]:
    if not raw_refresh:
        raise UnauthorizedError("Missing refresh token")
    user, new_refresh = rotate_refresh_token(db, raw_refresh)
    db.commit()
    return user, create_access_token(user.id), new_refresh


def logout(db: Session, raw_refresh: str | None) -> None:
    if raw_refresh:
        revoke_refresh_token(db, raw_refresh)
        db.commit()


def build_me(db: Session, user: User) -> MeResponse:
    owned = db.scalars(
        select(Business).where(Business.owner_id == user.id).order_by(Business.created_at)
    ).all()
    memberships = db.execute(
        select(StaffMember.id, Business.id, Business.name, Business.slug)
        .join(Business, Business.id == StaffMember.business_id)
        .where(
            StaffMember.user_id == user.id,
            StaffMember.is_active.is_(True),
            Business.is_active.is_(True),
        )
        .order_by(Business.name)
    ).all()
    return MeResponse(
        **UserRead.model_validate(user).model_dump(),
        owned_businesses=[BusinessSummary.model_validate(b) for b in owned],
        staff_memberships=[
            StaffMembership(staff_id=sid, business_id=bid, business_name=name, business_slug=slug)
            for sid, bid, name, slug in memberships
        ],
    )


def update_profile(db: Session, user: User, data: UserUpdate) -> User:
    user.full_name = data.full_name.strip()
    db.commit()
    db.refresh(user)
    return user


def login_or_create_google_user(db: Session, info: GoogleUserInfo) -> User:
    """Find by google_sub, else link a verified email, else create a customer."""
    user = db.scalar(select(User).where(User.google_sub == info.sub))
    if user is None:
        if not info.email_verified:
            raise UnauthorizedError("Google email is not verified")
        user = get_user_by_email(db, info.email)
        if user is not None:
            if user.google_sub and user.google_sub != info.sub:
                raise ConflictError("Account is linked to another Google identity")
            user.google_sub = info.sub
            user.is_verified = True
            if not user.oauth_provider:
                user.oauth_provider = "google"
            logger.info("Linked Google identity to user id=%s", user.id)
        else:
            user = User(
                email=info.email,
                hashed_password=None,
                full_name=info.name,
                role=UserRole.customer,
                is_active=True,  # column default only applies at flush
                is_verified=True,
                oauth_provider="google",
                google_sub=info.sub,
            )
            db.add(user)
            logger.info("Created user from Google sign-in")
    if not user.is_active:
        raise UnauthorizedError("Account is disabled")
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("Could not link Google account") from exc
    db.refresh(user)
    return user
