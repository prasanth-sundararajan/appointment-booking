"""APScheduler jobs: advisory-locked execution and job registration."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import engine
from app.jobs import scheduler as jobs
from app.models import Booking, BookingStatus
from tests.conftest import World, at


def test_expire_holds_job(db: Session, world: World, make_booking: Callable[..., Any]) -> None:
    booking = make_booking(
        world.service,
        world.staff,
        world.customer,
        at(world.day, 10),
        status=BookingStatus.pending_payment,
        paid=False,
        hold_expires_at=datetime.now(UTC) - timedelta(minutes=1),
    )
    jobs.job_expire_holds()
    db.expire_all()
    assert db.get(Booking, booking.id).status == BookingStatus.expired


def test_calendar_jobs_run(world: World) -> None:
    jobs.job_refresh_busy_blocks()
    jobs.job_renew_watches()
    jobs.job_retry_calendar_pushes()


def test_run_locked_skips_when_lock_held() -> None:
    calls: list[int] = []
    key = jobs._lock_key("busy")
    with engine.connect() as holder:
        holder.execute(text("SELECT pg_advisory_lock(:k)"), {"k": key})
        holder.commit()
        jobs.run_locked("busy", lambda db: calls.append(1))
        holder.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": key})
        holder.commit()
    assert calls == []
    jobs.run_locked("busy", lambda db: calls.append(1))
    assert calls == [1]


def test_run_locked_swallows_job_errors() -> None:
    def boom(db: Session) -> None:
        raise RuntimeError("job failed")

    jobs.run_locked("boom", boom)  # must not raise


def test_build_scheduler_registers_jobs() -> None:
    scheduler = jobs.build_scheduler()
    ids = {job.id for job in scheduler.get_jobs()}
    assert ids == {
        "expire_holds",
        "refresh_busy_blocks",
        "renew_watches",
        "retry_calendar_pushes",
        "retry_pending_refunds",
    }
    jobs.shutdown_scheduler(scheduler)  # not running: no-op
