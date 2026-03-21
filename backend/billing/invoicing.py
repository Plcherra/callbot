"""Period-close overage math and Stripe invoice items (Option A)."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

logger = logging.getLogger(__name__)


def sum_ledger_minutes(
    supabase: Any,
    *,
    user_id: str,
    period_start: date,
    period_end: date,
) -> float:
    """Sum usage_ledger.quantity for user and inclusive period dates."""
    r = (
        supabase.table("usage_ledger")
        .select("quantity")
        .eq("user_id", user_id)
        .eq("period_start", period_start.isoformat())
        .eq("period_end", period_end.isoformat())
        .execute()
    )
    total = 0.0
    for row in r.data or []:
        total += float(row.get("quantity") or 0)
    return round(total, 6)


def compute_overage_minutes(used_minutes: float, included_minutes: int) -> float:
    return max(0.0, used_minutes - float(included_minutes))

