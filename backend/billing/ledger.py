"""Immutable usage ledger helpers."""

from __future__ import annotations

import hashlib
import logging
from datetime import date, datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


def ledger_entry_hash(
    *,
    user_id: str,
    call_id: str | None,
    quantity: float,
    period_start: date,
    period_end: date,
    source: str,
) -> str:
    """Deterministic hash for idempotent inserts."""
    payload = f"{user_id}|{call_id or ''}|{quantity:.6f}|{period_start.isoformat()}|{period_end.isoformat()}|{source}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def period_dates_for_event(
    event_ts: datetime,
    subscription: dict[str, Any] | None,
) -> tuple[date, date]:
    """Billing period (DATE) for a usage event; falls back to calendar month if no subscription."""
    if subscription and subscription.get("current_period_start") and subscription.get("current_period_end"):
        ps = subscription["current_period_start"]
        pe = subscription["current_period_end"]
        if isinstance(ps, str):
            ps = datetime.fromisoformat(ps.replace("Z", "+00:00"))
        if isinstance(pe, str):
            pe = datetime.fromisoformat(pe.replace("Z", "+00:00"))
        if ps.tzinfo is None:
            ps = ps.replace(tzinfo=timezone.utc)
        if pe.tzinfo is None:
            pe = pe.replace(tzinfo=timezone.utc)
        return ps.date(), pe.date()
    # Calendar month fallback
    from calendar import monthrange

    ev = event_ts if event_ts.tzinfo else event_ts.replace(tzinfo=timezone.utc)
    first = date(ev.year, ev.month, 1)
    last_day = monthrange(ev.year, ev.month)[1]
    last = date(ev.year, ev.month, last_day)
    return first, last


def append_usage_ledger(
    supabase: Any,
    *,
    user_id: str,
    subscription_id: str | None,
    call_id: str | None,
    quantity_minutes: float,
    source: str,
    event_ts: datetime,
    subscription: dict[str, Any] | None,
) -> bool:
    """Insert usage_ledger row; returns False if duplicate hash (idempotent)."""
    if quantity_minutes <= 0:
        return True
    if event_ts.tzinfo is None:
        event_ts = event_ts.replace(tzinfo=timezone.utc)
    period_start, period_end = period_dates_for_event(event_ts, subscription)
    eh = ledger_entry_hash(
        user_id=user_id,
        call_id=call_id,
        quantity=quantity_minutes,
        period_start=period_start,
        period_end=period_end,
        source=source,
    )
    row = {
        "user_id": user_id,
        "subscription_id": subscription_id,
        "call_id": call_id,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "event_ts": event_ts.isoformat().replace("+00:00", "Z"),
        "unit_type": "minute",
        "quantity": round(quantity_minutes, 6),
        "source": source,
        "entry_hash": eh,
    }
    try:
        supabase.table("usage_ledger").insert(row).execute()
        return True
    except Exception as e:
        err = str(e).lower()
        if "23505" in str(e) or "duplicate" in err or "unique" in err:
            logger.info("[usage_ledger] duplicate skipped hash=%s...", eh[:16])
            return True
        logger.error("[usage_ledger] insert failed: %s", e)
        raise
