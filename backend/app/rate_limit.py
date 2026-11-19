"""Shared slowapi limiter.

Usage on an endpoint (the endpoint must take `request: Request`):

    @router.post("/login")
    @limiter.limit("10/minute")
    async def login(request: Request, ...): ...

Wire once in main.py: `register_rate_limiting(app)`.
"""

import logging

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings

logger = logging.getLogger(__name__)

limiter = Limiter(
    key_func=get_remote_address,
    enabled=settings.ENVIRONMENT != "test",
    headers_enabled=False,
    storage_uri=settings.RATE_LIMIT_STORAGE_URI,
)


async def rate_limit_exceeded_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.warning("Rate limit exceeded on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={"error": {"code": "RATE_LIMITED", "message": "Too many requests, slow down"}},
    )


def register_rate_limiting(app: FastAPI) -> None:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
