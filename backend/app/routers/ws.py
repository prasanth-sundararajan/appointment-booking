"""WebSocket endpoints (PRP Module 7). Include with no prefix.

- POST /api/ws/ticket {business_id}    auth: returns a 60s single-use ticket
- /ws/businesses/{id}/slots            public: slot.taken, slot.freed
- /ws/businesses/{id}/dashboard?ticket= owner/staff ticket: booking.created/confirmed/
  cancelled/rescheduled (+ booking.expired, booking.updated)

Long-lived access tokens never appear in WebSocket URLs (which end up in proxy logs);
clients exchange them for a short-lived ticket right before each (re)connect.

Clients may send "ping"; the server answers {"type": "pong"}.
Close codes: 4401 unauthenticated, 4403 not a member, 4404 unknown business.
"""

import logging
import threading
import time

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.security import create_ws_ticket, decode_ws_ticket
from app.database import SessionLocal, get_db
from app.dependencies import get_current_user, require_business_member
from app.exceptions import AppError
from app.models import Business, User
from app.realtime.manager import CHANNEL_DASHBOARD, CHANNEL_SLOTS, Channel, manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["realtime"])


class WsTicketRequest(BaseModel):
    business_id: int = Field(gt=0)


class WsTicketResponse(BaseModel):
    ticket: str
    expires_in: int


class _UsedTickets:
    """In-memory TTL set of consumed ticket ids (per process).

    Tickets live 60s, so entries are dropped once their expiry has passed.
    """

    def __init__(self) -> None:
        self._used: dict[str, float] = {}
        self._lock = threading.Lock()

    def consume(self, jti: str, expires_at: float) -> bool:
        """Mark `jti` used. Returns False if it was already used."""
        now = time.time()
        with self._lock:
            if len(self._used) > 1000:
                self._used = {k: v for k, v in self._used.items() if v > now}
            if jti in self._used and self._used[jti] > now:
                return False
            self._used[jti] = expires_at
            return True

    def clear(self) -> None:
        with self._lock:
            self._used.clear()


used_tickets = _UsedTickets()


def _business_active(business_id: int) -> bool:
    with SessionLocal() as db:
        business = db.get(Business, business_id)
        return business is not None and business.is_active


@router.post("/api/ws/ticket", response_model=WsTicketResponse)
async def create_ticket(
    data: WsTicketRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WsTicketResponse:
    """Issue a single-use, 60-second ticket for the business dashboard socket."""
    await run_in_threadpool(require_business_member, db, user, data.business_id)
    ticket, ttl = create_ws_ticket(user.id, data.business_id)
    return WsTicketResponse(ticket=ticket, expires_in=ttl)


def _user_from_ticket(ticket: str | None, business_id: int) -> User | None:
    """Validate type/expiry/business match and consume the ticket (single use)."""
    if not ticket:
        return None
    claims = decode_ws_ticket(ticket)
    if claims is None or claims["business_id"] != business_id:
        return None
    if not used_tickets.consume(claims["jti"], float(claims["exp"])):
        logger.warning("WebSocket ticket reuse rejected for user_id=%s", claims["sub"])
        return None
    with SessionLocal() as db:
        user = db.get(User, int(claims["sub"]))
        if user is None or not user.is_active:
            return None
        db.expunge(user)
        return user


def _is_member(user: User, business_id: int) -> bool:
    with SessionLocal() as db:
        try:
            require_business_member(db, user, business_id)
        except AppError:
            return False
        return True


async def _serve(websocket: WebSocket, business_id: int, channel: Channel) -> None:
    await manager.connect(websocket, business_id, channel)
    try:
        while True:
            message = await websocket.receive_text()
            if message.strip().lower() == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.debug("WebSocket closed with error", exc_info=True)
    finally:
        manager.disconnect(websocket, business_id, channel)


async def _reject(websocket: WebSocket, code: int) -> None:
    await websocket.accept()
    await websocket.close(code=code)


@router.websocket("/ws/businesses/{business_id}/slots")
async def slots_socket(websocket: WebSocket, business_id: int) -> None:
    if not await run_in_threadpool(_business_active, business_id):
        await _reject(websocket, 4404)
        return
    await _serve(websocket, business_id, CHANNEL_SLOTS)


@router.websocket("/ws/businesses/{business_id}/dashboard")
async def dashboard_socket(
    websocket: WebSocket, business_id: int, ticket: str | None = Query(None)
) -> None:
    user = await run_in_threadpool(_user_from_ticket, ticket, business_id)
    if user is None:
        await _reject(websocket, 4401)
        return
    if not await run_in_threadpool(_is_member, user, business_id):
        await _reject(websocket, 4403)
        return
    await _serve(websocket, business_id, CHANNEL_DASHBOARD)
