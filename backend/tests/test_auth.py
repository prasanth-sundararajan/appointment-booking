"""Auth: register, login, refresh rotation, logout, /me and Google sign-in."""

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import google_login
from app.auth.security import create_access_token, decode_access_token
from app.models import User, UserRole
from tests.conftest import PASSWORD, auth


def _register(client: TestClient, email: str = "new@test.com", **kw: str) -> Response:
    payload = {"email": email, "password": PASSWORD, "full_name": "New User", **kw}
    return client.post("/auth/register", json=payload)


def _login(client: TestClient, email: str, password: str = PASSWORD) -> Response:
    return client.post("/auth/login", data={"username": email, "password": password})


def test_register_creates_customer(client: TestClient) -> None:
    resp = _register(client, "New@Test.com")
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "new@test.com"
    assert body["role"] == "customer"
    assert "hashed_password" not in body


def test_register_owner_role_and_duplicate(client: TestClient) -> None:
    assert _register(client, "o@test.com", role="owner").json()["role"] == "owner"
    dup = _register(client, "O@test.com")
    assert dup.status_code == 409
    assert dup.json()["error"]["code"] == "EMAIL_TAKEN"


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "bad", "password": PASSWORD, "full_name": "x"},
        {"email": "a@b.com", "password": "short", "full_name": "x"},
        {"email": "a@b.com", "password": PASSWORD, "full_name": "   "},
        {"email": "a@b.com", "password": PASSWORD, "full_name": "x", "role": "staff"},
    ],
)
def test_register_validation(client: TestClient, payload: dict[str, str]) -> None:
    resp = client.post("/auth/register", json=payload)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_password_is_hashed(client: TestClient, db: Session) -> None:
    _register(client, "hash@test.com")

    user = db.scalar(select(User).where(User.email == "hash@test.com"))
    assert user.hashed_password and user.hashed_password != PASSWORD
    assert user.hashed_password.startswith("$2")


def _age_rotation(raw_refresh: str | None) -> None:
    """Move a token's rotation time past the reuse grace window."""
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import update

    from app.auth.security import REFRESH_REUSE_GRACE_SECONDS, hash_token
    from app.database import SessionLocal
    from app.models import RefreshToken

    assert raw_refresh
    past = datetime.now(UTC) - timedelta(seconds=REFRESH_REUSE_GRACE_SECONDS + 5)
    with SessionLocal() as s:
        s.execute(
            update(RefreshToken)
            .where(RefreshToken.token_hash == hash_token(raw_refresh))
            .values(rotated_at=past)
        )
        s.commit()


def test_login_me_refresh_logout(client: TestClient) -> None:
    _register(client, "flow@test.com")
    resp = _login(client, "FLOW@test.com")
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    assert resp.json()["token_type"] == "bearer"
    assert "refresh_token" in resp.cookies

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "flow@test.com"
    assert me.json()["owned_businesses"] == []

    old_refresh = client.cookies.get("refresh_token")
    refreshed = client.post("/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]
    new_refresh = client.cookies.get("refresh_token")
    assert new_refresh and new_refresh != old_refresh

    # Reuse within the 30s grace window (concurrent tabs) gets fresh tokens.
    grace = client.post("/auth/refresh", cookies={"refresh_token": old_refresh})
    assert grace.status_code == 200
    _age_rotation(old_refresh)

    # Replaying the rotated token after the grace window revokes the whole family.
    replay = client.post("/auth/refresh", cookies={"refresh_token": old_refresh})
    assert replay.status_code == 401
    client.cookies.set("refresh_token", new_refresh, path="/auth")
    assert client.post("/auth/refresh").status_code == 401

    _login(client, "flow@test.com")
    assert client.post("/auth/logout").status_code == 204
    assert client.post("/auth/refresh").status_code == 401


def test_refresh_without_cookie(client: TestClient) -> None:
    assert client.post("/auth/refresh").status_code == 401
    assert client.post("/auth/logout").status_code == 204


def test_login_wrong_password_and_unknown_user(client: TestClient) -> None:
    _register(client, "pw@test.com")
    assert _login(client, "pw@test.com", "wrong-password").status_code == 401
    assert _login(client, "nobody@test.com").status_code == 401


def test_inactive_user_cannot_login_or_use_token(
    client: TestClient, db: Session, make_user: Callable[..., User]
) -> None:
    user = make_user(email="off@test.com", password=PASSWORD)
    user.is_active = False
    db.commit()
    assert _login(client, "off@test.com").status_code == 401
    assert client.get("/auth/me", headers=auth(user)).status_code == 401


def test_me_requires_valid_token(client: TestClient) -> None:
    assert client.get("/auth/me").status_code == 401
    resp = client.get("/auth/me", headers={"Authorization": "Bearer garbage"})
    assert resp.status_code == 401
    assert resp.headers["www-authenticate"] == "Bearer"


def test_access_token_roundtrip() -> None:
    claims = decode_access_token(create_access_token(42))
    assert claims is not None and claims["sub"] == "42" and claims["type"] == "access"
    assert decode_access_token("not-a-jwt") is None


def test_update_me(client: TestClient, make_user: Callable[..., User]) -> None:
    user = make_user()
    resp = client.patch("/auth/me", json={"full_name": "  Renamed "}, headers=auth(user))
    assert resp.status_code == 200
    assert resp.json()["full_name"] == "Renamed"


# --------------------------------------------------------------------------- Google


def test_google_start_sets_state_and_pkce(client: TestClient) -> None:
    resp = client.get("/auth/google", follow_redirects=False)
    assert resp.status_code == 302
    location = resp.headers["location"]
    assert location.startswith(google_login.AUTHORIZE_URL)
    assert "code_challenge_method=S256" in location
    assert google_login.STATE_COOKIE in resp.cookies
    assert google_login.VERIFIER_COOKIE in resp.cookies


def test_google_callback_rejects_state_mismatch(client: TestClient) -> None:
    client.cookies.set(google_login.STATE_COOKIE, "expected", path="/auth/google")
    client.cookies.set(google_login.VERIFIER_COOKIE, "v" * 50, path="/auth/google")
    resp = client.get(
        "/auth/google/callback", params={"code": "c", "state": "other"}, follow_redirects=False
    )
    assert resp.status_code == 302
    assert resp.headers["location"].endswith("/login?error=google")
    err = client.get("/auth/google/callback?error=access_denied", follow_redirects=False)
    assert err.headers["location"].endswith("/login?error=google")


def test_google_callback_creates_and_links_user(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, make_user: Callable[..., User], db: Session
) -> None:
    existing = make_user(email="linked@test.com")

    async def fake_exchange(code: str, verifier: str) -> google_login.GoogleUserInfo:
        if code == "new":
            return google_login.GoogleUserInfo("sub-new", "fresh@test.com", True, "Fresh")
        if code == "unverified":
            return google_login.GoogleUserInfo("sub-x", "x@test.com", False, "X")
        return google_login.GoogleUserInfo("sub-link", "linked@test.com", True, "Linked")

    monkeypatch.setattr(google_login, "exchange_code_for_userinfo", fake_exchange)

    def callback(code: str) -> Response:
        client.cookies.set(google_login.STATE_COOKIE, "st", path="/auth/google")
        client.cookies.set(google_login.VERIFIER_COOKIE, "v" * 50, path="/auth/google")
        return client.get(
            "/auth/google/callback", params={"code": code, "state": "st"}, follow_redirects=False
        )

    ok = callback("new")
    assert ok.headers["location"].endswith("/auth/callback")
    assert "refresh_token" in ok.cookies

    callback("link")
    db.expire_all()
    db.refresh(existing)
    assert existing.google_sub == "sub-link" and existing.is_verified

    bad = callback("unverified")
    assert bad.headers["location"].endswith("/login?error=google")

    fresh = db.scalar(select(User).where(User.email == "fresh@test.com"))
    assert (
        fresh is not None and fresh.role == UserRole.customer and fresh.oauth_provider == "google"
    )
