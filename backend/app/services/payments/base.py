"""Payment provider interface. Production uses Dodo; tests use the fake provider."""

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Protocol


class PaymentProviderError(RuntimeError):
    """The provider API call failed (network, 4xx/5xx, unexpected response)."""


class WebhookVerificationError(ValueError):
    """The webhook signature/timestamp is invalid or the body is malformed."""


@dataclass(frozen=True)
class CheckoutSession:
    session_id: str
    checkout_url: str
    payment_id: str | None = None


@dataclass(frozen=True)
class RefundResult:
    refund_id: str
    status: str  # provider status, e.g. "pending" / "succeeded"


@dataclass(frozen=True)
class WebhookPayload:
    """Normalised webhook event."""

    event_id: str
    event_type: str  # e.g. "payment.succeeded", "payment.failed", "refund.succeeded"
    payment_id: str | None = None
    checkout_session_id: str | None = None
    refund_id: str | None = None
    amount_minor: int | None = None
    metadata: Mapping[str, str] = field(default_factory=dict)
    raw: Mapping[str, object] = field(default_factory=dict)

    @property
    def booking_id(self) -> int | None:
        value = self.metadata.get("booking_id")
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None


class PaymentProvider(Protocol):
    name: str

    def create_checkout(
        self,
        *,
        booking_id: int,
        amount_minor: int,
        currency: str,
        customer_email: str,
        customer_name: str,
        description: str,
        return_url: str,
    ) -> CheckoutSession: ...

    def refund(
        self,
        *,
        payment_id: str,
        amount_minor: int,
        reason: str,
        idempotency_key: str | None = None,
    ) -> RefundResult: ...

    def verify_webhook(self, body: bytes, headers: Mapping[str, str]) -> WebhookPayload: ...
