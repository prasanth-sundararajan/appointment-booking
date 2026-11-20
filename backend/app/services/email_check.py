"""Reject email addresses whose domain cannot receive mail (typos, test domains).

Fails open: if DNS is slow or unavailable, the address is accepted so real clients
are never blocked by our own lookup problems.
"""

import logging

from email_validator import EmailNotValidError, EmailUndeliverableError, validate_email

from app.exceptions import ValidationAppError

logger = logging.getLogger(__name__)

MESSAGE = "We couldn't verify that email address. Please check it for typos."


def ensure_deliverable(email: str) -> None:
    try:
        validate_email(email, check_deliverability=True, timeout=4)
    except EmailUndeliverableError as exc:
        raise ValidationAppError(MESSAGE) from exc
    except EmailNotValidError as exc:
        if "DNS" in str(exc) or "timed out" in str(exc).lower():
            logger.warning("Email deliverability check skipped: %s", exc)
            return
        raise ValidationAppError(MESSAGE) from exc
    except Exception:  # noqa: BLE001 - never block a booking on our own lookup failure
        logger.warning("Email deliverability check failed; allowing address", exc_info=True)
