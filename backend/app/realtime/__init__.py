"""Real-time WebSocket fan-out (see app.realtime.manager)."""

from app.realtime.manager import (
    CHANNEL_DASHBOARD,
    CHANNEL_SLOTS,
    manager,
    publish,
    publish_async,
    start_listener,
    stop_listener,
)

__all__ = [
    "CHANNEL_DASHBOARD",
    "CHANNEL_SLOTS",
    "manager",
    "publish",
    "publish_async",
    "start_listener",
    "stop_listener",
]
