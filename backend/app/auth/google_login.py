"""Google sign-in (OpenID Connect authorization code flow with state + PKCE).

Separate from the Google Calendar OAuth flow. The `state` and PKCE verifier are kept in
short-lived httpOnly cookies scoped to /auth/google and checked on callback (CSRF).
"""

import base64
import hashlib
import logging
import secrets
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx

from app.config import settings
from app.exceptions import AppError, UnauthorizedError

logger = logging.getLogger(__name__)

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
SCOPES = "openid email profile"

STATE_COOKIE = "g_oauth_state"
VERIFIER_COOKIE = "g_oauth_verifier"
COOKIE_PATH = f"{settings.ROOT_PATH}/auth/google"
COOKIE_MAX_AGE = 600  # seconds


@dataclass(frozen=True)
class GoogleUserInfo:
    sub: str
    email: str
    email_verified: bool
    name: str


def ensure_configured() -> None:
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise AppError("Google login is not configured", code="NOT_CONFIGURED", status_code=503)


def generate_state() -> str:
    return secrets.token_urlsafe(32)


def generate_code_verifier() -> str:
    return secrets.token_urlsafe(64)


def code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def build_authorization_url(state: str, verifier: str) -> str:
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_LOGIN_REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
        "code_challenge": code_challenge(verifier),
        "code_challenge_method": "S256",
        "prompt": "select_account",
        "access_type": "online",
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


def states_match(expected: str | None, received: str | None) -> bool:
    if not expected or not received:
        return False
    return secrets.compare_digest(expected, received)


async def exchange_code_for_userinfo(code: str, verifier: str) -> GoogleUserInfo:
    """Exchange the authorization code and fetch the OIDC userinfo."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_resp = await client.post(
                TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "redirect_uri": settings.GOOGLE_LOGIN_REDIRECT_URI,
                    "grant_type": "authorization_code",
                    "code_verifier": verifier,
                },
            )
            if token_resp.status_code != 200:
                logger.warning("Google token exchange failed: status=%s", token_resp.status_code)
                raise UnauthorizedError("Google sign-in failed")
            tokens: dict[str, Any] = token_resp.json()
            access_token = tokens.get("access_token")
            if not access_token:
                raise UnauthorizedError("Google sign-in failed")
            info_resp = await client.get(
                USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}
            )
            if info_resp.status_code != 200:
                logger.warning("Google userinfo failed: status=%s", info_resp.status_code)
                raise UnauthorizedError("Google sign-in failed")
            info: dict[str, Any] = info_resp.json()
    except httpx.HTTPError as exc:
        logger.warning("Google sign-in HTTP error: %s", exc)
        raise UnauthorizedError("Google sign-in failed") from exc

    sub = info.get("sub")
    email = info.get("email")
    if not sub or not email:
        raise UnauthorizedError("Google account has no email")
    return GoogleUserInfo(
        sub=str(sub),
        email=str(email).lower(),
        email_verified=bool(info.get("email_verified", False)),
        name=str(info.get("name") or "")[:150],
    )
