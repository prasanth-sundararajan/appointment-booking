"""Dodo Payments provider (checkout, refund, webhook verification).

Endpoints and fields were checked against docs.dodopayments.com (API reference:
Checkout Sessions `POST /checkouts`, Refunds `POST /refunds`, Webhooks = Standard
Webhooks). Always use test_mode until launch.
"""

import logging
import os
from collections.abc import Mapping

import httpx

from app.config import settings
from app.services.payments.base import (
    CheckoutSession,
    PaymentProviderError,
    RefundResult,
    WebhookPayload,
)
from app.services.payments.webhook_parsing import parse_dodo_payload, verify_standard_webhook

logger = logging.getLogger(__name__)

# Verified (Dodo docs): base URLs per environment.
_BASE_URLS = {
    "test_mode": "https://test.dodopayments.com",
    "live_mode": "https://live.dodopayments.com",
}


def _deposit_product_id(currency: str) -> str:
    """Dodo charges against a product. A "pay what you want" product is used for deposits
    and `product_cart[].amount` sets the amount per checkout.

    Per Dodo docs that amount is in the *product's* currency (`billing_currency` is only
    honoured with Adaptive Pricing), so create one PWYW product per business currency and
    set DODO_DEPOSIT_PRODUCT_ID_<CUR> (e.g. DODO_DEPOSIT_PRODUCT_ID_EUR). The plain
    DODO_DEPOSIT_PRODUCT_ID is the fallback for the product's own currency. Set the
    product's minimum price to the smallest deposit you accept."""
    per_currency = os.environ.get(f"DODO_DEPOSIT_PRODUCT_ID_{currency.upper()}", "")
    return str(per_currency or settings.DODO_DEPOSIT_PRODUCT_ID)


class DodoPaymentProvider:
    name = "dodo"

    def __init__(
        self,
        api_key: str,
        webhook_secret: str,
        environment: str = "test_mode",
        timeout: float = 15.0,
    ) -> None:
        self._api_key = api_key
        self._webhook_secret = webhook_secret
        self._base_url = _BASE_URLS.get(environment, _BASE_URLS["test_mode"])
        self._timeout = timeout

    def _request(
        self,
        method: str,
        path: str,
        json_body: Mapping[str, object],
        extra_headers: Mapping[str, str] | None = None,
    ) -> dict[str, object]:
        url = f"{self._base_url}{path}"
        headers = {"Authorization": f"Bearer {self._api_key}", **(extra_headers or {})}
        try:
            with httpx.Client(timeout=self._timeout) as client:
                response = client.request(
                    method,
                    url,
                    json=dict(json_body),
                    headers=headers,
                )
        except httpx.HTTPError as exc:
            logger.error("Dodo %s %s failed: %s", method, path, exc.__class__.__name__)
            raise PaymentProviderError("Payment provider unreachable") from exc
        if response.status_code >= 400:
            logger.error(
                "Dodo %s %s returned %s: %s",
                method,
                path,
                response.status_code,
                response.text[:500],
            )
            raise PaymentProviderError(f"Payment provider error ({response.status_code})")
        try:
            data = response.json()
        except ValueError as exc:
            raise PaymentProviderError("Payment provider returned invalid JSON") from exc
        if not isinstance(data, dict):
            raise PaymentProviderError("Unexpected payment provider response")
        return data

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
        product_id = _deposit_product_id(currency)
        if not product_id:
            raise PaymentProviderError("DODO_DEPOSIT_PRODUCT_ID is not configured")
        # Verified (Dodo docs): POST /checkouts (Checkout Sessions API).
        body: dict[str, object] = {
            "product_cart": [
                # Verified: `amount` = price paid for pay-what-you-want products (minor units)
                {"product_id": product_id, "quantity": 1, "amount": amount_minor}
            ],
            "customer": {"email": customer_email, "name": customer_name or customer_email},
            # Verified: only honoured when Adaptive Pricing is enabled; otherwise ignored.
            "billing_currency": currency.upper(),
            # Dodo appends `payment_id` and `status` query params on redirect.
            "return_url": return_url,
            "metadata": {"booking_id": str(booking_id), "description": description[:200]},
        }
        data = self._request("POST", "/checkouts", body)
        session_id = data.get("session_id")  # verified
        checkout_url = data.get("checkout_url")  # verified
        if not isinstance(session_id, str) or not isinstance(checkout_url, str):
            raise PaymentProviderError("Checkout response missing session_id/checkout_url")
        payment_id = data.get("payment_id")
        return CheckoutSession(
            session_id=session_id,
            checkout_url=checkout_url,
            payment_id=payment_id if isinstance(payment_id, str) else None,
        )

    def refund(
        self,
        *,
        payment_id: str,
        amount_minor: int,
        reason: str,
        idempotency_key: str | None = None,
    ) -> RefundResult:
        # Verified (Dodo docs): POST /refunds {payment_id, reason}; full refund when no
        # `items` are passed. Response: refund_id, status (succeeded|failed|pending|review).
        # Idempotency-Key (Bearer auth verified; key support unverified, harmless if
        # ignored): retries of the same payment's refund reuse one key.
        extra = {"Idempotency-Key": idempotency_key} if idempotency_key else None
        data = self._request(
            "POST", "/refunds", {"payment_id": payment_id, "reason": reason}, extra
        )
        refund_id = data.get("refund_id")  # verified
        if not isinstance(refund_id, str):
            raise PaymentProviderError("Refund response missing refund_id")
        status = data.get("status")
        return RefundResult(refund_id=refund_id, status=status if isinstance(status, str) else "")

    def verify_webhook(self, body: bytes, headers: Mapping[str, str]) -> WebhookPayload:
        # Dodo follows the Standard Webhooks spec (webhook-id / -timestamp / -signature).
        verify_standard_webhook(self._webhook_secret, body, headers)
        return parse_dodo_payload(body, headers)
