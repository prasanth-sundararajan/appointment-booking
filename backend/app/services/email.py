"""Email notifications (PRP Module 9).

- Async SMTP via aiosmtplib, HTML from Jinja2 templates in app/templates/email/.
- With SMTP_HOST empty (dev) emails are only logged.
- Nothing here ever raises: failures are logged.
- The `send_*` sync wrappers are meant for FastAPI BackgroundTasks / scheduler jobs
  (they run in a worker thread, open their own DB session and event loop).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path
from zoneinfo import ZoneInfo

import aiosmtplib
from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.orm import joinedload

from app.config import settings
from app.database import SessionLocal
from app.models import Booking, StaffMember
from app.services.deposit import format_money

logger = logging.getLogger(__name__)

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "email"

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATE_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


def render_template(template: str, context: dict[str, object]) -> str:
    return _env.get_template(f"{template}.html").render(
        app_name="SlotEase", frontend_url=settings.FRONTEND_URL, **context
    )


async def send_email(to: str, subject: str, template: str, context: dict[str, object]) -> bool:
    """Render and send one email. Returns True when sent (or logged in dev)."""
    try:
        html = render_template(template, context)
    except Exception:
        logger.exception("Failed to render email template %s", template)
        return False

    if not settings.SMTP_HOST:
        logger.info("Email (SMTP disabled) to=%s subject=%r template=%s", to, subject, template)
        return True

    message = EmailMessage()
    message["From"] = settings.EMAIL_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content("This email requires an HTML-capable client.")
    message.add_alternative(html, subtype="html")
    try:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER or None,
            password=settings.SMTP_PASSWORD or None,
            use_tls=settings.SMTP_PORT == 465,
            start_tls=settings.SMTP_PORT == 587,
            timeout=20,
        )
        logger.info("Email sent to=%s template=%s", to, template)
        return True
    except Exception:
        logger.exception("Failed to send email to=%s template=%s", to, template)
        return False


def send_email_sync(to: str, subject: str, template: str, context: dict[str, object]) -> bool:
    """Blocking wrapper; must be called from a thread without a running event loop."""
    try:
        return asyncio.run(send_email(to, subject, template, context))
    except RuntimeError:
        logger.exception("send_email_sync called inside a running event loop")
        return False
    except Exception:
        logger.exception("Unexpected email failure")
        return False


# --------------------------------------------------------------------------- helpers


def _local(dt: datetime, tz_name: str) -> str:
    return dt.astimezone(ZoneInfo(tz_name)).strftime("%a %d %b %Y, %H:%M")


def _load_booking(booking_id: int) -> Booking | None:
    with SessionLocal() as db:
        return db.get(
            Booking,
            booking_id,
            options=[
                joinedload(Booking.business),
                joinedload(Booking.service),
                joinedload(Booking.staff).joinedload(StaffMember.user),
                joinedload(Booking.customer),
                joinedload(Booking.payment),
            ],
        )


def _booking_context(booking: Booking) -> dict[str, object]:
    tz = booking.business.timezone
    payment = booking.payment
    return {
        "booking_id": booking.id,
        "business_name": booking.business.name,
        "service_name": booking.service.name,
        "staff_name": booking.staff.display_name,
        "customer_name": booking.customer.full_name or booking.customer.email,
        "start_local": _local(booking.start_at, tz),
        "end_local": _local(booking.end_at, tz),
        "timezone": tz,
        "deposit": format_money(payment.amount_minor, payment.currency) if payment else None,
        "cutoff_hours": booking.business.cancellation_cutoff_hours,
        "booking_url": f"{settings.FRONTEND_URL}/bookings/{booking.id}",
        "dashboard_url": f"{settings.FRONTEND_URL}/dashboard/b/{booking.business_id}/calendar",
    }


def _business_recipients(booking: Booking) -> list[str]:
    emails = {e for e in (booking.business.email, booking.staff.email) if e}
    return sorted(emails)


# --------------------------------------------------------------------------- sync wrappers


def send_booking_confirmed(booking_id: int) -> None:
    try:
        booking = _load_booking(booking_id)
        if booking is None:
            return
        ctx = _booking_context(booking)
        send_email_sync(
            booking.customer.email,
            f"Booking confirmed: {booking.business.name}",
            "booking_confirmed",
            {**ctx, "audience": "customer"},
        )
        for to in _business_recipients(booking):
            send_email_sync(
                to,
                f"New booking: {booking.service.name}",
                "booking_confirmed",
                {**ctx, "audience": "business"},
            )
    except Exception:
        logger.exception("send_booking_confirmed failed for booking %s", booking_id)


def send_booking_cancelled(
    booking_id: int, refund_eligible: bool, refund_amount_minor: int, cancelled_by: str
) -> None:
    try:
        booking = _load_booking(booking_id)
        if booking is None:
            return
        currency = booking.payment.currency if booking.payment else booking.business.currency
        ctx = {
            **_booking_context(booking),
            "refund_eligible": refund_eligible,
            "refund_amount": format_money(refund_amount_minor, currency),
            "cancelled_by": cancelled_by,
        }
        send_email_sync(
            booking.customer.email,
            f"Booking cancelled: {booking.business.name}",
            "booking_cancelled",
            {**ctx, "audience": "customer"},
        )
        for to in _business_recipients(booking):
            send_email_sync(
                to,
                f"Booking cancelled: {booking.service.name}",
                "booking_cancelled",
                {**ctx, "audience": "business"},
            )
    except Exception:
        logger.exception("send_booking_cancelled failed for booking %s", booking_id)


def send_booking_rescheduled(booking_id: int, old_start_at: datetime) -> None:
    try:
        booking = _load_booking(booking_id)
        if booking is None:
            return
        ctx = {
            **_booking_context(booking),
            "old_start_local": _local(old_start_at, booking.business.timezone),
        }
        send_email_sync(
            booking.customer.email,
            f"Booking rescheduled: {booking.business.name}",
            "booking_rescheduled",
            {**ctx, "audience": "customer"},
        )
        for to in _business_recipients(booking):
            send_email_sync(
                to,
                f"Booking rescheduled: {booking.service.name}",
                "booking_rescheduled",
                {**ctx, "audience": "business"},
            )
    except Exception:
        logger.exception("send_booking_rescheduled failed for booking %s", booking_id)


def send_staff_invite(to: str, business_name: str, invite_url: str) -> None:
    try:
        send_email_sync(
            to,
            f"You're invited to join {business_name} on SlotEase",
            "staff_invite",
            {"business_name": business_name, "invite_url": invite_url},
        )
    except Exception:
        logger.exception("send_staff_invite failed")
