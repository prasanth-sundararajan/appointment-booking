"""In-memory payment provider for dev (no DODO_API_KEY) and tests."""

import logging
import uuid
from collections.abc import Mapping
from dataclasses import dataclass, field

from app.services.payments.base import (
    CheckoutSession,
    PaymentProviderError,
    RefundResult,
    WebhookPayload,
    WebhookVerificationError,
)
from app.services.payments.webhook_parsing import parse_dodo_payload, verify_standard_webhook

logger = logging.getLogger(__name__)


@dataclass
class FakePaymentProvider:
    """Records calls for assertions. Set `fail_checkout` / `fail_refund` to simulate errors.

    Webhooks: when `webhook_secret` is set, signatures are verified exactly like Dodo
    (Standard Webhooks); otherwise any well-formed body is accepted (dev only).
    """

    webhook_secret: str = ""
    checkout_base_url: str = "http://localhost:5173/bookings/success"
    name: str = "fake"
    fail_checkout: bool = False
    fail_refund: bool = False
    require_signature: bool = False
    checkouts: list[dict[str, object]] = field(default_factory=list)
    refunds: list[dict[str, object]] = field(default_factory=list)

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
    ) -> CheckoutSession:
        if self.fail_checkout:
            raise PaymentProviderError("Fake checkout failure")
        session_id = f"fake_cs_{uuid.uuid4().hex[:16]}"
        payment_id = f"fake_pay_{uuid.uuid4().hex[:16]}"
        self.checkouts.append(
            {
                "booking_id": booking_id,
                "amount_minor": amount_minor,
                "currency": currency,
                "session_id": session_id,
                "payment_id": payment_id,
            }
        )
        logger.info(
            "Fake checkout %s for booking %s (%s %s)",
            session_id,
            booking_id,
            amount_minor,
            currency,
        )
        sep = "&" if "?" in return_url else "?"
        return CheckoutSession(
            session_id=session_id,
            checkout_url=f"{return_url}{sep}fake_session={session_id}",
            payment_id=payment_id,
        )

    def refund(
        self,
        *,
        payment_id: str,
        amount_minor: int,
        reason: str,
        idempotency_key: str | None = None,
    ) -> RefundResult:
        if self.fail_refund:
            raise PaymentProviderError("Fake refund failure")
        if idempotency_key:  # same key -> same refund, like a real provider
            for previous in self.refunds:
                if previous.get("idempotency_key") == idempotency_key:
                    return RefundResult(refund_id=str(previous["refund_id"]), status="succeeded")
        refund_id = f"fake_ref_{uuid.uuid4().hex[:16]}"
        self.refunds.append(
            {
                "payment_id": payment_id,
                "amount_minor": amount_minor,
                "reason": reason,
                "refund_id": refund_id,
                "idempotency_key": idempotency_key,
            }
        )
        return RefundResult(refund_id=refund_id, status="succeeded")

    def verify_webhook(self, body: bytes, headers: Mapping[str, str]) -> WebhookPayload:
        if self.webhook_secret:
            verify_standard_webhook(self.webhook_secret, body, headers)
        elif self.require_signature:
            # Never accept unsigned webhooks in production (anyone could confirm bookings).
            raise WebhookVerificationError("Webhook secret not configured")
        return parse_dodo_payload(body, headers)
