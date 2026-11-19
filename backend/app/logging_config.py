"""Logging setup. Use `logging.getLogger(__name__)` everywhere; never print()."""

import logging.config

from app.config import settings


def configure_logging(level: str | None = None) -> None:
    log_level = (level or settings.LOG_LEVEL).upper()
    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "default": {
                    "format": "%(asctime)s %(levelname)s [%(name)s] %(message)s",
                },
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "default",
                },
            },
            "root": {"level": log_level, "handlers": ["console"]},
            "loggers": {
                "uvicorn": {"level": log_level, "propagate": True},
                "uvicorn.access": {"level": log_level, "propagate": True},
                "sqlalchemy.engine": {"level": "WARNING", "propagate": True},
                "apscheduler": {"level": "INFO", "propagate": True},
            },
        }
    )
