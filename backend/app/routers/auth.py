"""Auth endpoints: /auth/* (mounted without /api; nginx forwards /auth to the backend)."""

import logging

from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.auth import google_login
from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.exceptions import AppError
from app.models import User
from app.rate_limit import limiter
from app.schemas.auth import LoginResponse, RegisterRequest
from app.schemas.user import MeResponse, UserRead, UserUpdate
from app.services import auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
REFRESH_COOKIE_PATH = f"{settings.ROOT_PATH}/auth"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        path=REFRESH_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
    )


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, data: RegisterRequest, db: Session = Depends(get_db)) -> User:
    return auth_service.register_user(db, data)


@router.post("/login", response_model=LoginResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    response: Response,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> LoginResponse:
    """Form-encoded `username` (email) + `password`. Refresh token is set as a cookie."""
    user = auth_service.authenticate(db, form.username, form.password)
    access, refresh = auth_service.issue_tokens(db, user)
    _set_refresh_cookie(response, refresh)
    return LoginResponse(access_token=access, user=UserRead.model_validate(user))


@router.post("/refresh", response_model=LoginResponse)
async def refresh(
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> LoginResponse:
    try:
        user, access, new_refresh = auth_service.refresh_tokens(db, refresh_token)
    except AppError:
        _clear_refresh_cookie(response)
        raise
    _set_refresh_cookie(response, new_refresh)
    return LoginResponse(access_token=access, user=UserRead.model_validate(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    refresh_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> Response:
    auth_service.logout(db, refresh_token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response)
    return response


@router.get("/me", response_model=MeResponse)
async def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MeResponse:
    return auth_service.build_me(db, user)


@router.patch("/me", response_model=UserRead)
async def update_me(
    data: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> User:
    return auth_service.update_profile(db, user, data)


# ---------------------------------------------------------------- Google sign-in


@router.get("/google")
@limiter.limit("20/minute")
async def google_start(request: Request) -> RedirectResponse:
    google_login.ensure_configured()
    state = google_login.generate_state()
    verifier = google_login.generate_code_verifier()
    response = RedirectResponse(
        google_login.build_authorization_url(state, verifier),
        status_code=status.HTTP_302_FOUND,
    )
    for key, value in (
        (google_login.STATE_COOKIE, state),
        (google_login.VERIFIER_COOKIE, verifier),
    ):
        response.set_cookie(
            key=key,
            value=value,
            max_age=google_login.COOKIE_MAX_AGE,
            httponly=True,
            secure=settings.is_production,
            samesite="lax",
            path=google_login.COOKIE_PATH,
        )
    return response


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """On success: set refresh cookie and redirect to FRONTEND_URL/auth/callback.

    The SPA then calls POST /auth/refresh to obtain an access token, so no token
    ever appears in a URL.
    """
    frontend = settings.FRONTEND_URL.rstrip("/")
    expected_state = request.cookies.get(google_login.STATE_COOKIE)
    verifier = request.cookies.get(google_login.VERIFIER_COOKIE)

    def _fail(reason: str) -> RedirectResponse:
        logger.warning("Google sign-in failed: %s", reason)
        resp = RedirectResponse(f"{frontend}/login?error=google", status_code=status.HTTP_302_FOUND)
        _clear_google_cookies(resp)
        return resp

    if error:
        return _fail(f"provider error {error[:50]}")
    if not code or not verifier or not google_login.states_match(expected_state, state):
        return _fail("state mismatch or missing code")
    try:
        google_login.ensure_configured()
        info = await google_login.exchange_code_for_userinfo(code, verifier)
        user = auth_service.login_or_create_google_user(db, info)
        _access, refresh_token = auth_service.issue_tokens(db, user)
    except AppError as exc:
        return _fail(exc.code)

    resp = RedirectResponse(f"{frontend}/auth/callback", status_code=status.HTTP_302_FOUND)
    _clear_google_cookies(resp)
    _set_refresh_cookie(resp, refresh_token)
    return resp


def _clear_google_cookies(response: Response) -> None:
    for key in (google_login.STATE_COOKIE, google_login.VERIFIER_COOKIE):
        response.delete_cookie(key=key, path=google_login.COOKIE_PATH)
