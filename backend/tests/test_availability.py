"""Working hours, time off and the public slots endpoint."""

from collections.abc import Callable
from datetime import UTC, datetime, time, timedelta
from typing import Any

from fastapi.testclient import TestClient

from app.models import StaffMember, User
from tests.conftest import World, at, auth


def _hours_url(staff: StaffMember) -> str:
    return f"/api/staff/{staff.id}/hours"


def test_replace_and_get_hours(client: TestClient, world: World) -> None:
    h = auth(world.owner)
    week = [
        {"weekday": 0, "start_time": "13:00", "end_time": "17:00"},
        {"weekday": 0, "start_time": "09:00", "end_time": "12:00"},
        {"weekday": 2, "start_time": "10:00", "end_time": "14:00"},
    ]
    resp = client.put(_hours_url(world.staff), json=week, headers=h)
    assert resp.status_code == 200
    got = [(r["weekday"], r["start_time"]) for r in resp.json()]
    assert got == [(0, "09:00:00"), (0, "13:00:00"), (2, "10:00:00")]
    assert len(client.get(_hours_url(world.staff), headers=h).json()) == 3


def test_hours_validation(client: TestClient, world: World) -> None:
    h = auth(world.owner)
    overlap = [
        {"weekday": 1, "start_time": "09:00", "end_time": "12:00"},
        {"weekday": 1, "start_time": "11:00", "end_time": "13:00"},
    ]
    assert client.put(_hours_url(world.staff), json=overlap, headers=h).status_code == 422
    reversed_ = [{"weekday": 1, "start_time": "12:00", "end_time": "09:00"}]
    assert client.put(_hours_url(world.staff), json=reversed_, headers=h).status_code == 422
    bad_day = [{"weekday": 7, "start_time": "09:00", "end_time": "10:00"}]
    assert client.put(_hours_url(world.staff), json=bad_day, headers=h).status_code == 422
    too_many = [{"weekday": 0, "start_time": "00:00", "end_time": "00:10"}] * 43
    assert client.put(_hours_url(world.staff), json=too_many, headers=h).status_code == 422


def test_staff_manage_own_hours_only(
    client: TestClient,
    world: World,
    make_user: Callable[..., User],
    make_staff: Callable[..., StaffMember],
) -> None:
    u1, u2 = make_user(), make_user()
    s1 = make_staff(world.business, [world.service], user=u1)
    s2 = make_staff(world.business, [world.service], user=u2)
    week = [{"weekday": 3, "start_time": "08:00", "end_time": "09:00"}]
    assert client.put(_hours_url(s1), json=week, headers=auth(u1)).status_code == 200
    assert client.put(_hours_url(s2), json=week, headers=auth(u1)).status_code == 403
    assert client.get(_hours_url(s2), headers=auth(u1)).status_code == 200  # read is fine
    assert client.get(_hours_url(s2), headers=auth(world.customer)).status_code == 403
    assert client.get("/api/staff/99999/hours", headers=auth(u1)).status_code == 404


def test_time_off_crud(client: TestClient, world: World) -> None:
    h = auth(world.owner)
    url = f"/api/staff/{world.staff.id}/time-off"
    start = at(world.day, 9)
    resp = client.post(
        url,
        json={
            "start_at": start.isoformat(),
            "end_at": (start + timedelta(hours=3)).isoformat(),
            "reason": "  Dentist ",
        },
        headers=h,
    )
    assert resp.status_code == 201 and resp.json()["reason"] == "Dentist"
    tid = resp.json()["id"]

    bad = client.post(
        url, json={"start_at": start.isoformat(), "end_at": start.isoformat()}, headers=h
    )
    assert bad.status_code == 422
    naive = client.post(
        url, json={"start_at": "2030-01-01T09:00:00", "end_at": "2030-01-01T10:00:00"}, headers=h
    )
    assert naive.status_code == 422

    assert len(client.get(url, headers=h).json()) == 1
    later = (start + timedelta(days=1)).isoformat()
    assert client.get(url, params={"from": later}, headers=h).json() == []

    assert client.delete(f"/api/time-off/{tid}", headers=h).status_code == 204
    assert client.delete(f"/api/time-off/{tid}", headers=h).status_code == 404


def _slots(client: TestClient, world: World, **params: Any) -> Any:
    query = {"service_id": world.service.id, "date": world.day.isoformat(), **params}
    return client.get(f"/api/businesses/{world.business.id}/slots", params=query)


def test_slots_endpoint(client: TestClient, world: World) -> None:
    resp = _slots(client, world)
    assert resp.status_code == 200
    body = resp.json()
    assert body["timezone"] == "UTC"
    starts = [datetime.fromisoformat(s["start_at"]) for s in body["slots"]]
    # 09:00 .. 16:00 every 15 minutes for a 60-minute service in a 09-17 day.
    assert starts[0] == at(world.day, 9) and starts[-1] == at(world.day, 16)
    assert len(starts) == 29
    assert body["slots"][0]["staff_ids"] == [world.staff.id]


def test_slots_time_off_removes_slots(client: TestClient, world: World) -> None:
    client.post(
        f"/api/staff/{world.staff.id}/time-off",
        json={
            "start_at": at(world.day, 9).isoformat(),
            "end_at": at(world.day, 15).isoformat(),
        },
        headers=auth(world.owner),
    )
    starts = [s["start_at"] for s in _slots(client, world).json()["slots"]]
    assert starts[0].startswith(f"{world.day.isoformat()}T15:00")


def test_slots_endpoint_errors(
    client: TestClient,
    world: World,
    make_business: Callable[..., Any],
    make_service: Callable[..., Any],
    make_staff: Callable[..., StaffMember],
) -> None:
    other = make_business()
    foreign_service = make_service(other)
    foreign_staff = make_staff(other, [foreign_service])
    assert _slots(client, world, service_id=foreign_service.id).status_code == 404
    assert _slots(client, world, staff_id=foreign_staff.id).status_code == 404
    resp = client.get(
        "/api/businesses/99999/slots",
        params={"service_id": world.service.id, "date": world.day.isoformat()},
    )
    assert resp.status_code == 404
    assert _slots(client, world, date="not-a-date").status_code == 422


def test_slots_staff_filter_and_merge(
    client: TestClient, world: World, make_staff: Callable[..., StaffMember]
) -> None:
    second = make_staff(world.business, [world.service], name="Bo", hours=(time(16), time(18)))
    merged = _slots(client, world).json()["slots"]
    four_pm = next(s for s in merged if s["start_at"].startswith(f"{world.day}T16:00"))
    assert four_pm["staff_ids"] == sorted([world.staff.id, second.id])
    only = _slots(client, world, staff_id=second.id).json()["slots"]
    assert [s["start_at"][11:16] for s in only] == ["16:00", "16:15", "16:30", "16:45", "17:00"]
    assert all(s["staff_ids"] == [second.id] for s in only)


def test_slots_past_day_is_empty(client: TestClient, world: World) -> None:
    yesterday = (datetime.now(UTC) - timedelta(days=1)).date().isoformat()
    assert _slots(client, world, date=yesterday).json()["slots"] == []
