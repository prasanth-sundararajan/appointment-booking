"""Payment providers. Use `get_payment_provider()`; tests may `set_payment_provider(fake)`."""

import logging

from app.config import settings
from app.services.payments.base import (
    CheckoutSession,
    PaymentProvider,
    PaymentProviderError,
    RefundResult,
    WebhookPayload,
    WebhookVerificationError,
)

logger = logging.getLogger(__name__)

__all__ = [
    "CheckoutSession",
    "PaymentProvider",
    "PaymentProviderError",
    "RefundResult",
    "WebhookPayload",
    "WebhookVerificationError",
    "get_payment_provider",
    "set_payment_provider",
]

_provider: PaymentProvider | None = None


def get_payment_provider() -> PaymentProvider:
    """Dodo when DODO_API_KEY is set, otherwise the in-memory fake (dev/tests)."""
    global _provider
    if _provider is None:
        if settings.DODO_API_KEY:
            from app.services.payments.dodo import DodoPaymentProvider

            _provider = DodoPaymentProvider(
                api_key=settings.DODO_API_KEY,
                webhook_secret=settings.DODO_WEBHOOK_SECRET,
                environment=settings.DODO_ENVIRONMENT,
            )
        else:
            from app.services.payments.fake import FakePaymentProvider

            if settings.is_production:
                logger.warning("DODO_API_KEY is empty in production; using fake payments")
            _provider = FakePaymentProvider(
                webhook_secret=settings.DODO_WEBHOOK_SECRET,
                checkout_base_url=f"{settings.FRONTEND_URL}/bookings/success",
                require_signature=settings.is_production,
            )
    return _provider


def set_payment_provider(provider: PaymentProvider | None) -> None:
    """Override (tests) or reset (None) the cached provider."""
    global _provider
    _provider = provider
