"""SlotEase FastAPI application factory."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import settings
from app.database import SessionLocal
from app.exceptions import register_exception_handlers
from app.jobs.scheduler import shutdown_scheduler, start_scheduler
from app.logging_config import configure_logging
from app.rate_limit import register_rate_limiting
from app.realtime import start_listener, stop_listener
from app.routers import (
    auth,
    availability,
    bookings,
    businesses,
    calendar,
    contact,
    payments,
    services,
    slots,
    staff,
    ws,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info("SlotEase starting (env=%s)", settings.ENVIRONMENT)
    await start_listener()
    scheduler = start_scheduler() if settings.SCHEDULER_ENABLED else None
    yield
    if scheduler is not None:
        shutdown_scheduler(scheduler)
    await stop_listener()
    logger.info("SlotEase shutting down")


def _ping_db() -> None:
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))


def create_app() -> FastAPI:
    configure_logging()

    app = FastAPI(
        title="SlotEase API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None if settings.is_production else "/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    @app.get("/health", tags=["health"])
    async def health() -> JSONResponse:
        try:
            await run_in_threadpool(_ping_db)
        except Exception:
            logger.exception("Health check: database unreachable")
            return JSONResponse(
                status_code=503, content={"status": "error", "database": "unreachable"}
            )
        return JSONResponse(content={"status": "ok", "database": "ok"})

    register_rate_limiting(app)

    app.include_router(auth.router)
    app.include_router(businesses.router)
    app.include_router(services.router)
    app.include_router(staff.router)
    app.include_router(availability.router)
    app.include_router(slots.router)
    app.include_router(bookings.router)
    app.include_router(payments.router)
    app.include_router(calendar.router, prefix="/api/calendar", tags=["calendar"])
    app.include_router(ws.router)
    app.include_router(contact.router)

    return app


app = create_app()
