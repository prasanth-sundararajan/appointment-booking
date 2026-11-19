"""Shared Standard Webhooks verification + Dodo payload normalisation."""

import json
from collections.abc import Mapping

from standardwebhooks.webhooks import Webhook
from standardwebhooks.webhooks import WebhookVerificationError as SWVerificationError

from app.services.payments.base import WebhookPayload, WebhookVerificationError


def _str_or_none(value: object) -> str | None:
    return str(value) if value not in (None, "") else None


def verify_standard_webhook(secret: str, body: bytes, headers: Mapping[str, str]) -> None:
    """Verify `webhook-id`, `webhook-timestamp`, `webhook-signature` (Standard Webhooks)."""
    lowered = {k.lower(): v for k, v in headers.items()}
    try:
        Webhook(secret).verify(body, lowered)
    except SWVerificationError as exc:
        raise WebhookVerificationError(str(exc)) from exc
    except Exception as exc:  # malformed secret / headers
        raise WebhookVerificationError("Webhook verification failed") from exc


def parse_dodo_payload(body: bytes, headers: Mapping[str, str]) -> WebhookPayload:
    """Normalise a Dodo webhook body.

    Verified against Dodo docs: envelope is `{business_id, type, timestamp, data}` where
    `data` is the Payment/Refund object (`payment_id`, `refund_id`, `checkout_session_id`,
    `total_amount`/`amount`, `metadata`). The unique event id is the `webhook-id` header.
    Event types: payment.succeeded|failed|processing|cancelled, refund.succeeded|failed.
    """
    lowered = {k.lower(): v for k, v in headers.items()}
    try:
        doc = json.loads(body)
    except (ValueError, UnicodeDecodeError) as exc:
        raise WebhookVerificationError("Body is not valid JSON") from exc
    if not isinstance(doc, dict):
        raise WebhookVerificationError("Body must be a JSON object")

    event_id = lowered.get("webhook-id") or _str_or_none(doc.get("id"))
    event_type = _str_or_none(doc.get("type"))
    if not event_id or not event_type:
        raise WebhookVerificationError("Missing event id or type")

    data = doc.get("data") if isinstance(doc.get("data"), dict) else {}
    assert isinstance(data, dict)
    raw_meta = data.get("metadata")
    metadata = {str(k): str(v) for k, v in raw_meta.items()} if isinstance(raw_meta, dict) else {}

    amount: int | None = None
    for key in ("total_amount", "amount"):  # Payment.total_amount / Refund.amount
        value = data.get(key)
        if isinstance(value, int):
            amount = value
            break

    return WebhookPayload(
        event_id=event_id,
        event_type=event_type,
        payment_id=_str_or_none(data.get("payment_id")),
        checkout_session_id=_str_or_none(data.get("checkout_session_id")),
        refund_id=_str_or_none(data.get("refund_id")),
        amount_minor=amount,
        metadata=metadata,
        raw=doc,
    )
