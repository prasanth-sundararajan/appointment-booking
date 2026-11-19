"""APScheduler jobs.

Every job run first takes a Postgres advisory lock (`pg_try_advisory_lock`) keyed by job,
so even if several processes start a scheduler, each tick executes in only one of them.

Usage:
    scheduler = start_scheduler()      # in-process (FastAPI lifespan); None if disabled
    ...
    shutdown_scheduler(scheduler)

or the dedicated container: `python -m app.jobs.run_scheduler`.
"""

import logging
import zlib
from collections.abc import Callable
from datetime import UTC, datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.schedulers.base import BaseScheduler
from apscheduler.schedulers.blocking import BlockingScheduler
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal, engine

logger = logging.getLogger(__name__)

LOCK_NAMESPACE = "slotease.jobs."


def _lock_key(name: str) -> int:
    """Stable signed 32-bit key per job name."""
    return zlib.crc32(f"{LOCK_NAMESPACE}{name}".encode()) - 2**31


def run_locked(name: str, job: Callable[[Session], object]) -> None:
    """Run `job(db)` only if this process wins the advisory lock for `name`."""
    key = _lock_key(name)
    try:
        with engine.connect() as lock_conn:
            acquired = bool(
                lock_conn.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": key}).scalar()
            )
            lock_conn.commit()
            if not acquired:
                logger.debug("Job %s skipped: lock held by another instance", name)
                return
            try:
                with SessionLocal() as db:
                    result = job(db)
                    db.commit()
                logger.debug("Job %s finished: %s", name, result)
            except Exception:
                logger.exception("Job %s failed", name)
            finally:
                lock_conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": key})
                lock_conn.commit()
    except Exception:
        logger.exception("Job %s could not acquire its lock", name)


# ---------------------------------------------------------------- job bodies


def _expire_holds(db: Session) -> int:
    # Agent B's service publishes 'slot.freed' for each expired hold.
    from app.services.booking_service import expire_holds

    count = expire_holds(db, datetime.now(UTC))
    if count:
        logger.info("Expired %d hold(s)", count)
    return count


def _refresh_busy_blocks(db: Session) -> int:
    from app.services.calendar_sync import calendar_sync_enabled, refresh_all_busy_blocks

    return refresh_all_busy_blocks(db) if calendar_sync_enabled() else 0


def _renew_watches(db: Session) -> int:
    from app.services.calendar_sync import calendar_sync_enabled, renew_watches

    return renew_watches(db) if calendar_sync_enabled() else 0


def _retry_calendar_pushes(db: Session) -> int:
    from app.services.calendar_sync import calendar_sync_enabled, retry_pending_pushes

    return retry_pending_pushes(db) if calendar_sync_enabled() else 0


def _retry_pending_refunds(db: Session) -> int:
    from app.services.booking_service import retry_pending_refunds

    count = retry_pending_refunds(db)
    if count:
        logger.info("Retried %d pending refund(s)", count)
    return count


def job_expire_holds() -> None:
    run_locked("expire_holds", _expire_holds)


def job_refresh_busy_blocks() -> None:
    run_locked("refresh_busy_blocks", _refresh_busy_blocks)


def job_renew_watches() -> None:
    run_locked("renew_watches", _renew_watches)


def job_retry_calendar_pushes() -> None:
    run_locked("retry_calendar_pushes", _retry_calendar_pushes)


def job_retry_pending_refunds() -> None:
    run_locked("retry_pending_refunds", _retry_pending_refunds)


# ---------------------------------------------------------------- scheduler


def build_scheduler(blocking: bool = False) -> BaseScheduler:
    """Create (not start) a scheduler with all SlotEase jobs registered."""
    scheduler: BaseScheduler = (
        BlockingScheduler(timezone=UTC) if blocking else BackgroundScheduler(timezone=UTC)
    )
    common = {"coalesce": True, "max_instances": 1, "replace_existing": True}
    now = datetime.now(UTC)
    scheduler.add_job(
        job_expire_holds, "interval", minutes=1, id="expire_holds", next_run_time=now, **common
    )
    scheduler.add_job(
        job_refresh_busy_blocks, "interval", minutes=5, id="refresh_busy_blocks", **common
    )
    scheduler.add_job(
        job_renew_watches, "interval", hours=1, id="renew_watches", next_run_time=now, **common
    )
    scheduler.add_job(
        job_retry_calendar_pushes, "interval", minutes=5, id="retry_calendar_pushes", **common
    )
    scheduler.add_job(
        job_retry_pending_refunds, "interval", minutes=5, id="retry_pending_refunds", **common
    )
    return scheduler


def start_scheduler() -> BackgroundScheduler | None:
    """Start the in-process background scheduler unless SCHEDULER_ENABLED is false."""
    if not settings.SCHEDULER_ENABLED:
        logger.info("Scheduler disabled (SCHEDULER_ENABLED=false)")
        return None
    scheduler = build_scheduler(blocking=False)
    assert isinstance(scheduler, BackgroundScheduler)
    scheduler.start()
    logger.info("Background scheduler started")
    return scheduler


def shutdown_scheduler(scheduler: BaseScheduler | None) -> None:
    if scheduler is not None and scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
