from __future__ import annotations

from datetime import datetime, timezone

import pytest

from calendar_api import calendar_handler


class _FreebusyQuery:
    def __init__(self, result: dict):
        self._result = result

    def execute(self) -> dict:
        return self._result


class _Freebusy:
    def __init__(self, result: dict):
        self._result = result

    def query(self, body: dict) -> _FreebusyQuery:
        return _FreebusyQuery(self._result)


class _EventsInsert:
    def __init__(self, event: dict):
        self._event = event

    def execute(self) -> dict:
        return self._event


class _Events:
    def __init__(self, event: dict):
        self._event = event

    def insert(self, calendarId: str, body: dict, sendUpdates: str = "none") -> _EventsInsert:
        return _EventsInsert(self._event)


class _Service:
    def __init__(self, freebusy_result: dict, event: dict | None = None):
        self._freebusy_result = freebusy_result
        self._event = event or {}

    def freebusy(self) -> _Freebusy:
        return _Freebusy(self._freebusy_result)

    def events(self) -> _Events:
        return _Events(self._event)


def test_check_availability_requires_date():
    service = _Service(freebusy_result={})
    out = calendar_handler._handle_check_availability(service, "primary", params={})
    assert out["success"] is False
    assert out["error"] == "date_missing"


def test_check_availability_range_defaults_to_60_minutes():
    freebusy = {"calendars": {"primary": {"busy": []}}}
    service = _Service(freebusy_result=freebusy)
    out = calendar_handler._handle_check_availability(
        service,
        "primary",
        # Use a deterministic date-only input so parsing is stable in tests.
        params={"date_text": "2026-03-18", "timezone": "America/New_York"},
    )
    assert out["success"] is True
    assert out["slot_duration_minutes"] == calendar_handler.DEFAULT_AVAILABILITY_SLOT_MINUTES
    assert len(out.get("suggested_slots") or []) <= calendar_handler.SUGGESTED_SLOTS_MAX


def test_create_appointment_missing_date_returns_date_missing():
    service = _Service(freebusy_result={})
    out = calendar_handler._handle_create_appointment(
        service,
        "primary",
        params={"summary": "Test"},
        receptionist_id="rec-1",
        supabase=None,
    )
    assert out["success"] is False
    assert out["error"] == "date_missing"


def test_create_appointment_busy_slot_returns_slot_unavailable_and_suggestions(monkeypatch):
    # First freebusy check (slot check) returns busy, then day freebusy returns empty.
    class _ServiceBusyThenDay(_Service):
        def __init__(self):
            super().__init__(freebusy_result={})
            self._calls = 0

        def freebusy(self) -> _Freebusy:
            self._calls += 1
            if self._calls == 1:
                return _Freebusy({"calendars": {"primary": {"busy": [{"start": "2026-03-17T10:00:00+00:00", "end": "2026-03-17T10:30:00+00:00"}]}}})
            return _Freebusy({"calendars": {"primary": {"busy": []}}})

    service = _ServiceBusyThenDay()

    # Avoid appointment persistence side effects.
    class _SB:
        def table(self, name: str):
            raise AssertionError("should not persist on slot_unavailable")

    out = calendar_handler._handle_create_appointment(
        service,
        "primary",
        params={
            "summary": "Test",
            "start_time": "2026-03-17T10:00:00+00:00",
            "duration_minutes": 30,
        },
        receptionist_id="rec-1",
        supabase=_SB(),
    )
    assert out["success"] is False
    assert out["error"] == "slot_unavailable"
    assert isinstance(out.get("suggested_slots"), list)
    assert len(out.get("suggested_slots") or []) <= 5


def test_create_appointment_success_returns_event_fields(monkeypatch):
    freebusy = {"calendars": {"primary": {"busy": []}}}
    event = {
        "id": "evt-123",
        "htmlLink": "https://example.com/event",
        "start": {"dateTime": "2026-03-17T10:00:00+00:00"},
        "end": {"dateTime": "2026-03-17T10:30:00+00:00"},
        "summary": "Test",
    }
    service = _Service(freebusy_result=freebusy, event=event)

    class _Tbl:
        def insert(self, row: dict):
            return self

        def execute(self):
            return type("R", (), {"data": []})()

    class _SB:
        def table(self, name: str):
            assert name == "appointments"
            return _Tbl()

    out = calendar_handler._handle_create_appointment(
        service,
        "primary",
        params={
            "summary": "Test",
            "start_time": "2026-03-17T10:00:00+00:00",
            "duration_minutes": 30,
        },
        receptionist_id="rec-1",
        supabase=_SB(),
    )
    assert out["success"] is True
    assert out["event_id"] == "evt-123"
    assert out["summary"] == "Test"
