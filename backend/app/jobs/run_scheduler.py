"""Dedicated scheduler process: `python -m app.jobs.run_scheduler`.

Used by the `scheduler` service in docker-compose. Web workers should then run with
SCHEDULER_ENABLED=false; the advisory locks keep jobs single-run either way.
"""

import logging
import signal
import sys
from types import FrameType

from app.jobs.scheduler import build_scheduler
from app.logging_config import configure_logging

logger = logging.getLogger("app.jobs.run_scheduler")


def main() -> int:
    configure_logging()
    import app.models  # noqa: F401  register all mappers before jobs touch the ORM

    scheduler = build_scheduler(blocking=True)

    def _stop(signum: int, _frame: FrameType | None) -> None:
        logger.info("Received signal %s, shutting down scheduler", signum)
        if scheduler.running:
            scheduler.shutdown(wait=False)

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    logger.info("Starting SlotEase blocking scheduler")
    try:
        scheduler.start()  # blocks until shutdown
    except (KeyboardInterrupt, SystemExit):
        pass
    logger.info("Scheduler exited")
    return 0


if __name__ == "__main__":
    sys.exit(main())
