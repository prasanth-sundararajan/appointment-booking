"""WebSocket connection manager with Postgres LISTEN/NOTIFY fan-out (PRP Module 7).

- `manager` keeps the sockets connected to THIS worker, per (business_id, channel).
- `publish()` (sync, thread-safe) sends `pg_notify('slotease_events', ...)` so every
  uvicorn/gunicorn worker (and the scheduler process) reaches all clients.
- `start_listener()` / `stop_listener()` (lifespan) run a LISTEN thread that pushes
  notifications into the event loop. If Postgres/NOTIFY is unavailable, or this process
  has no listener, events are delivered in-process.

Event shape sent to clients: {"type": "slot.taken", "data": {...}}.
"""

from __future__ import annotations

import asyncio
import json
import logging
import select
import threading
from collections import defaultdict
from collections.abc import Mapping
from typing import Literal

from fastapi import WebSocket
from sqlalchemy import text

from app.database import engine

logger = logging.getLogger(__name__)

Channel = Literal["slots", "dashboard"]
CHANNEL_SLOTS: Channel = "slots"
CHANNEL_DASHBOARD: Channel = "dashboard"
PG_CHANNEL = "slotease_events"
_MAX_NOTIFY_BYTES = 7900  # Postgres limit is 8000 bytes


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[tuple[int, str], set[WebSocket]] = defaultdict(set)
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, websocket: WebSocket, business_id: int, channel: Channel) -> None:
        await websocket.accept()
        self._loop = asyncio.get_running_loop()
        self._connections[(business_id, channel)].add(websocket)

    def disconnect(self, websocket: WebSocket, business_id: int, channel: Channel) -> None:
        key = (business_id, channel)
        sockets = self._connections.get(key)
        if sockets is not None:
            sockets.discard(websocket)
            if not sockets:
                self._connections.pop(key, None)

    def connection_count(self, business_id: int, channel: Channel) -> int:
        return len(self._connections.get((business_id, channel), ()))

    async def broadcast_local(
        self, business_id: int, channel: str, message: Mapping[str, object]
    ) -> None:
        key = (business_id, channel)
        dead: list[WebSocket] = []
        for ws in list(self._connections.get(key, ())):
            try:
                await ws.send_json(dict(message))
            except Exception:
                dead.append(ws)
        for ws in dead:
            sockets = self._connections.get(key)
            if sockets is not None:
                sockets.discard(ws)

    def dispatch_threadsafe(
        self, business_id: int, channel: str, message: Mapping[str, object]
    ) -> None:
        """Schedule a local broadcast from any thread (no-op if no loop is known)."""
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        if not self._connections.get((business_id, channel)):
            return
        try:
            asyncio.run_coroutine_threadsafe(
                self.broadcast_local(business_id, channel, message), loop
            )
        except RuntimeError:
            logger.debug("Event loop not running; dropped realtime event")


manager = ConnectionManager()


# --------------------------------------------------------------------------- NOTIFY


def _encode(business_id: int, channel: str, event: Mapping[str, object]) -> str:
    return json.dumps({"b": business_id, "c": channel, "e": dict(event)}, default=str)


def _is_postgres() -> bool:
    return engine.dialect.name == "postgresql"


def publish(business_id: int, channel: Channel, event: Mapping[str, object]) -> None:
    """Publish an event to every worker. Never raises. Safe from threads."""
    try:
        payload = _encode(business_id, channel, event)
    except (TypeError, ValueError):
        logger.exception("Realtime event is not JSON serialisable: %s", event.get("type"))
        return
    message = json.loads(payload)["e"]  # normalised (datetimes -> str)

    notified = False
    if _is_postgres() and len(payload.encode("utf-8")) <= _MAX_NOTIFY_BYTES:
        try:
            with engine.connect() as conn:
                conn.execute(
                    text("SELECT pg_notify(:ch, :payload)"), {"ch": PG_CHANNEL, "payload": payload}
                )
                conn.commit()
            notified = True
        except Exception:
            logger.warning(
                "pg_notify failed; delivering realtime event in-process only", exc_info=True
            )

    # The local LISTEN thread delivers NOTIFYs to this worker's sockets. Without it
    # (or when NOTIFY failed) deliver directly.
    if not notified or not _listener.is_running:
        manager.dispatch_threadsafe(business_id, channel, message)


async def publish_async(business_id: int, channel: Channel, event: Mapping[str, object]) -> None:
    await asyncio.to_thread(publish, business_id, channel, event)


class _PgListener:
    """Background thread: LISTEN on PG_CHANNEL and forward payloads to the event loop."""

    def __init__(self) -> None:
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._ready = threading.Event()

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive() and self._ready.is_set()

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop.clear()
        self._ready.clear()
        self._thread = threading.Thread(target=self._run, name="pg-listener", daemon=True)
        self._thread.start()

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout)
        self._thread = None
        self._ready.clear()

    def _dsn(self) -> str:
        return engine.url.set(drivername="postgresql").render_as_string(hide_password=False)

    def _handle(self, payload: str) -> None:
        try:
            doc = json.loads(payload)
            business_id = int(doc["b"])
            channel = str(doc["c"])
            event = doc["e"]
        except (ValueError, KeyError, TypeError):
            logger.warning("Ignoring malformed realtime notification")
            return
        if isinstance(event, dict):
            manager.dispatch_threadsafe(business_id, channel, event)

    def _run(self) -> None:
        import psycopg2
        import psycopg2.extensions

        backoff = 1.0
        while not self._stop.is_set():
            conn = None
            try:
                conn = psycopg2.connect(self._dsn())
                conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
                with conn.cursor() as cur:
                    cur.execute(f"LISTEN {PG_CHANNEL}")
                self._ready.set()
                backoff = 1.0
                logger.info("Realtime listener connected (LISTEN %s)", PG_CHANNEL)
                while not self._stop.is_set():
                    readable, _, _ = select.select([conn], [], [], 1.0)
                    if not readable:
                        continue
                    conn.poll()
                    while conn.notifies:
                        self._handle(conn.notifies.pop(0).payload)
            except Exception:
                self._ready.clear()
                logger.warning("Realtime listener error; retrying in %.0fs", backoff, exc_info=True)
                self._stop.wait(backoff)
                backoff = min(backoff * 2, 30.0)
            finally:
                if conn is not None:
                    try:
                        conn.close()
                    except Exception:
                        logger.debug("Error closing listener connection", exc_info=True)
        self._ready.clear()


_listener = _PgListener()


async def start_listener() -> None:
    """Call from the FastAPI lifespan startup."""
    manager.bind_loop(asyncio.get_running_loop())
    if not _is_postgres():
        logger.info("Realtime: non-Postgres database, using in-process delivery only")
        return
    _listener.start()


async def stop_listener() -> None:
    """Call from the FastAPI lifespan shutdown."""
    await asyncio.to_thread(_listener.stop)
