"""Agenda today: local day bounds and is_past flag."""

from __future__ import annotations

from datetime import datetime, timezone

from api.mobile import agenda


def test_local_day_bounds_utc_respects_offset():
    start, end = agenda._local_day_bounds_utc("2026-06-15", -240)
    assert start == datetime(2026, 6, 15, 4, 0, 0, tzinfo=timezone.utc)
    assert end == datetime(2026, 6, 16, 4, 0, 0, tzinfo=timezone.utc)


def test_attach_is_past_true_when_end_before_now():
    rows = [{"end_time": "2020-01-01T12:00:00Z"}]
    now = datetime(2030, 1, 1, tzinfo=timezone.utc)
    agenda._attach_is_past(rows, now)
    assert rows[0]["is_past"] is True


def test_attach_is_past_false_when_end_after_now():
    rows = [{"end_time": "2030-01-01T12:00:00Z"}]
    now = datetime(2020, 1, 1, tzinfo=timezone.utc)
    agenda._attach_is_past(rows, now)
    assert rows[0]["is_past"] is False
