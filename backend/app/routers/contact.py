"""Portfolio contact form: emails enquiries to CONTACT_TO."""

import logging
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, EmailStr, Field

from app.config import settings
from app.rate_limit import limiter
from app.services.email import send_email_sync
from app.services.email_check import ensure_deliverable

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["contact"])


class ContactRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    project_type: Literal["AI Agents", "Agentic AI", "AI Automation", "SaaS Development", "Other"]
    budget: str = Field(default="Not sure yet", max_length=40)
    message: str = Field(min_length=10, max_length=5000)
    website: str = Field(default="", max_length=200)  # honeypot


class ContactResponse(BaseModel):
    ok: bool


@router.post("/contact", response_model=ContactResponse)
@limiter.limit("5/hour")
async def contact(
    request: Request, data: ContactRequest, background_tasks: BackgroundTasks
) -> ContactResponse:
    if data.website:  # bots fill hidden fields; pretend success
        return ContactResponse(ok=True)
    await run_in_threadpool(ensure_deliverable, str(data.email))
    to = settings.CONTACT_TO or settings.SMTP_USER
    if not to:
        logger.warning("Contact form received but CONTACT_TO/SMTP_USER is not set")
        return ContactResponse(ok=True)
    background_tasks.add_task(
        send_email_sync,
        to,
        f"New enquiry: {data.project_type} from {data.name}",
        "contact_enquiry.html",
        data.model_dump(exclude={"website"}),
    )
    return ContactResponse(ok=True)
