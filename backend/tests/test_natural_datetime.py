from __future__ import annotations

from datetime import datetime

from zoneinfo import ZoneInfo

from utils.natural_datetime import parse_natural_datetime


def test_march_17th_at_7pm_parses():
    out = parse_natural_datetime("March 17th at 7pm", timezone="America/New_York")
    assert out is not None
    assert out.dt.tzinfo is not None
    assert out.is_time_explicit is True


def test_tomorrow_at_4_parses_with_relative_base():
    base = datetime(2026, 3, 14, 12, 0, tzinfo=ZoneInfo("America/New_York"))
    out = parse_natural_datetime("tomorrow at 4", timezone="America/New_York", now=base)
    assert out is not None
    assert out.dt.date().isoformat() == "2026-03-15"
    assert out.is_time_explicit is True


def test_next_tuesday_parses_date():
    base = datetime(2026, 3, 14, 12, 0, tzinfo=ZoneInfo("America/New_York"))
    out = parse_natural_datetime("next Tuesday", timezone="America/New_York", now=base)
    assert out is not None
    assert out.dt.tzinfo is not None
    # Should land at least a week in the future for 'next'.
    assert (out.dt - base).days >= 7


def test_march_17th_year_rollover_when_past():
    base = datetime(2026, 4, 1, 12, 0, tzinfo=ZoneInfo("America/New_York"))
    out = parse_natural_datetime("March 17th at 7pm", timezone="America/New_York", now=base)
    assert out is not None
    # Parsed year should roll to the next year when March 17 has already passed.
    assert out.dt.year == base.year + 1


def test_ambiguous_short_date_fails_or_parses_but_is_not_required():
    # We don't want to *require* mm/dd/yyyy; this just ensures parser doesn't crash.
    out = parse_natural_datetime("03/04", timezone="America/New_York")
    assert out is None or out.dt.tzinfo is not None

