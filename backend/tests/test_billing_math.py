"""Unit tests for Option A billing math."""

from __future__ import annotations

from datetime import date

import pytest

from billing.invoicing import compute_overage_minutes
from billing.ledger import ledger_entry_hash, period_dates_for_event


def test_compute_overage_minutes() -> None:
    assert compute_overage_minutes(100.0, 300) == 0.0
    assert compute_overage_minutes(350.5, 300) == pytest.approx(50.5)
    assert compute_overage_minutes(0.0, 300) == 0.0


def test_ledger_hash_stable() -> None:
    h1 = ledger_entry_hash(
        user_id="u1",
        call_id="c1",
        quantity=1.5,
        period_start=date(2026, 1, 1),
        period_end=date(2026, 1, 31),
        source="telnyx_webhook",
    )
    h2 = ledger_entry_hash(
        user_id="u1",
        call_id="c1",
        quantity=1.5,
        period_start=date(2026, 1, 1),
        period_end=date(2026, 1, 31),
        source="telnyx_webhook",
    )
    assert h1 == h2
    assert len(h1) == 64


def test_period_dates_fallback_calendar_month() -> None:
    from datetime import datetime, timezone

    ev = datetime(2026, 3, 15, 12, 0, 0, tzinfo=timezone.utc)
    ps, pe = period_dates_for_event(ev, None)
    assert ps == date(2026, 3, 1)
    assert pe == date(2026, 3, 31)
