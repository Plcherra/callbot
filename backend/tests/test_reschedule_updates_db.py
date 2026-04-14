"""Reschedule syncs Google Calendar and appointments row when supabase + receptionist_id are provided."""

from __future__ import annotations

import logging
from unittest.mock import MagicMock

import pytest

from calendar_api._booking import handle_reschedule


def _parse_stub(_new_start, timezone: str = "America/New_York"):
    return None, "exact_time_window"


def _google_service_success(*, event_id: str, start_dt_iso: str, end_dt_iso: str):
    """Minimal Google API shape after events().patch().execute()."""
    svc = MagicMock()
    patch_exec = MagicMock(
        return_value={
            "id": event_id,
            "start": {"dateTime": start_dt_iso},
            "end": {"dateTime": end_dt_iso},
            "summary": "Cut",
        }
    )
    svc.events.return_value.patch.return_value.execute = patch_exec
    return svc, patch_exec


def test_reschedule_updates_appointments_row():
    rec_id = "11111111-1111-1111-1111-111111111111"
    event_id = "gcal_evt_abc"
    params = {
        "event_id": event_id,
        "new_start": "2026-06-15T14:00:00",
        "duration_minutes": 45,
        "timezone": "America/New_York",
    }

    svc, patch_exec = _google_service_success(
        event_id=event_id,
        start_dt_iso="2026-06-15T14:00:00-04:00",
        end_dt_iso="2026-06-15T14:45:00-04:00",
    )

    after_first_eq = MagicMock()
    after_first_eq.execute.return_value = MagicMock(data=[{"id": "apt-1"}])

    after_update = MagicMock()
    after_update.eq.return_value = after_first_eq

    tbl = MagicMock()
    tbl.update.return_value = after_update

    supabase = MagicMock()
    supabase.table.return_value = tbl

    result = handle_reschedule(
        svc,
        "primary",
        params,
        default_timezone="America/New_York",
        default_slot_minutes=30,
        parse_datetime_range_fn=_parse_stub,
        receptionist_id=rec_id,
        supabase=supabase,
    )

    assert result["success"] is True
    supabase.table.assert_called_with("appointments")
    tbl.update.assert_called_once()
    payload = tbl.update.call_args[0][0]
    assert payload["duration_minutes"] == 45
    assert "start_time" in payload and "end_time" in payload and "updated_at" in payload
    after_update.eq.assert_called_once_with("receptionist_id", rec_id)
    after_first_eq.eq.assert_called_once_with("event_id", event_id)
    patch_exec.assert_called_once()


def test_reschedule_no_appointment_row_logs_warning(caplog):
    rec_id = "22222222-2222-2222-2222-222222222222"
    event_id = "gcal_evt_xyz"
    params = {
        "event_id": event_id,
        "new_start": "2026-07-01T10:00:00",
        "timezone": "America/New_York",
    }

    svc, _ = _google_service_success(
        event_id=event_id,
        start_dt_iso="2026-07-01T10:00:00-04:00",
        end_dt_iso="2026-07-01T10:30:00-04:00",
    )

    eq2 = MagicMock()
    eq2.execute.return_value = MagicMock(data=[])

    eq1 = MagicMock()
    eq1.eq.return_value = eq2

    upd = MagicMock()
    upd.eq.return_value = eq1

    tbl = MagicMock()
    tbl.update.return_value = upd

    supabase = MagicMock()
    supabase.table.return_value = tbl

    caplog.set_level(logging.WARNING)
    result = handle_reschedule(
        svc,
        "primary",
        params,
        default_timezone="America/New_York",
        default_slot_minutes=30,
        parse_datetime_range_fn=_parse_stub,
        receptionist_id=rec_id,
        supabase=supabase,
    )

    assert result["success"] is True
    assert any("reschedule_no_appointment_row" in r.message for r in caplog.records)


def test_reschedule_without_supabase_skips_db_update():
    params = {
        "event_id": "evt_only_gcal",
        "new_start": "2026-08-01T09:00:00",
        "timezone": "America/New_York",
    }
    svc, _ = _google_service_success(
        event_id="evt_only_gcal",
        start_dt_iso="2026-08-01T09:00:00-04:00",
        end_dt_iso="2026-08-01T09:30:00-04:00",
    )

    supabase = MagicMock()

    result = handle_reschedule(
        svc,
        "primary",
        params,
        default_timezone="America/New_York",
        default_slot_minutes=30,
        parse_datetime_range_fn=_parse_stub,
        receptionist_id=None,
        supabase=supabase,
    )

    assert result["success"] is True
    supabase.table.assert_not_called()
