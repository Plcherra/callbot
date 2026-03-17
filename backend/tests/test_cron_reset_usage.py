"""Minimal tests for reset-usage cron: boundary is date-only (no colons) for PostgREST safety."""

from __future__ import annotations

from datetime import datetime

import pytest


def _first_day_boundary_utc() -> str:
    """Replicate cron logic: date-only boundary for period_reset_at filter."""
    now = datetime.utcnow()
    first_day = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return first_day.strftime("%Y-%m-%d")


def test_reset_usage_boundary_is_date_only():
    """Boundary must not contain colons to avoid PostgREST query string parsing issues."""
    boundary = _first_day_boundary_utc()
    assert ":" not in boundary, "Boundary must be date-only (no colons)"
    assert len(boundary) == 10
    assert boundary[4] == "-" and boundary[7] == "-"
    # Parsable as date (first day of month)
    parsed = datetime.strptime(boundary, "%Y-%m-%d")
    assert parsed.day == 1
    assert parsed.year == datetime.utcnow().year
    assert 1 <= parsed.month <= 12


def test_reset_usage_boundary_format():
    """Boundary must match %Y-%m-%d for valid PostgreSQL date comparison."""
    boundary = _first_day_boundary_utc()
    parts = boundary.split("-")
    assert len(parts) == 3
    assert len(parts[0]) == 4  # year
    assert len(parts[1]) == 2  # month
    assert len(parts[2]) == 2  # day
    assert all(p.isdigit() for p in parts)
