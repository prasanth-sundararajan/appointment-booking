"""Fernet encryption for OAuth tokens stored at rest (settings.TOKEN_ENCRYPTION_KEY)."""

import logging
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

logger = logging.getLogger(__name__)


class TokenCryptoError(RuntimeError):
    """Raised when the key is missing/invalid or a ciphertext cannot be decrypted."""


@lru_cache(maxsize=4)
def _fernet(key: str) -> Fernet:
    if not key:
        raise TokenCryptoError("TOKEN_ENCRYPTION_KEY is not configured")
    try:
        return Fernet(key.encode("utf-8"))
    except (ValueError, TypeError) as exc:
        raise TokenCryptoError("TOKEN_ENCRYPTION_KEY is not a valid Fernet key") from exc


def encrypt_token(plaintext: str) -> str:
    """Encrypt a token and return URL-safe base64 ciphertext."""
    return _fernet(settings.TOKEN_ENCRYPTION_KEY).encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_token(ciphertext: str) -> str:
    """Decrypt ciphertext produced by encrypt_token."""
    try:
        return (
            _fernet(settings.TOKEN_ENCRYPTION_KEY)
            .decrypt(ciphertext.encode("ascii"))
            .decode("utf-8")
        )
    except InvalidToken as exc:
        logger.error("Failed to decrypt stored OAuth token (key rotated or data corrupt)")
        raise TokenCryptoError("Unable to decrypt token") from exc


def encrypt_optional(plaintext: str | None) -> str | None:
    return encrypt_token(plaintext) if plaintext else None


def decrypt_optional(ciphertext: str | None) -> str | None:
    return decrypt_token(ciphertext) if ciphertext else None
