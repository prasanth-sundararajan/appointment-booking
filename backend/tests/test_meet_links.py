"""Google Meet links + client invites only for the AI-consulting business."""

from collections.abc import Callable
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.config import settings
from app.services import calendar_sync
from tests.conftest import World, at


def _booking(world: World, make_booking: Callable[..., Any], db: Session) -> Any:
    b = make_booking(world.service, world.staff, world.customer, at(world.day, 11))
    db.refresh(b)
    return b


def test_meet_added_for_consulting_slug(
    world: World, make_booking: Callable[..., Any], db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "MEET_BUSINESS_SLUGS", world.business.slug)
    body = calendar_sync._event_body(_booking(world, make_booking, db))
    assert (
        body["conferenceData"]["createRequest"]["conferenceSolutionKey"]["type"] == "hangoutsMeet"
    )
    assert body["attendees"][0]["email"] == world.customer.email


def test_no_meet_for_other_businesses(
    world: World, make_booking: Callable[..., Any], db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "MEET_BUSINESS_SLUGS", "some-other-business")
    body = calendar_sync._event_body(_booking(world, make_booking, db))
    assert "conferenceData" not in body and "attendees" not in body
