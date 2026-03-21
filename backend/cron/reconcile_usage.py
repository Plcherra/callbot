"""Reconciliation: append usage_ledger rows for billing_calls missing ledger entries."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from billing.ledger import append_usage_ledger
from billing.subscriptions import get_active_subscription

logger = logging.getLogger(__name__)


def reconcile_missing_ledger_entries(supabase: Any) -> dict[str, int]:
    """
    For each billing_calls row with billable_minutes > 0, ensure a usage_ledger row exists
    (by matching call_id). If missing, append with source=reconciliation_job.
    """
    try:
        bc = (
            supabase.table("billing_calls")
            .select("id, user_id, billable_minutes, ended_at")
            .gt("billable_minutes", 0)
            .limit(5000)
            .execute()
        )
    except Exception as e:
        logger.exception("[reconcile] billing_calls fetch failed: %s", e)
        return {"reconciled": 0, "errors": 1}

    try:
        lg = supabase.table("usage_ledger").select("call_id").not_.is_("call_id", "null").execute()
    except Exception as e:
        logger.exception("[reconcile] usage_ledger fetch failed: %s", e)
        return {"reconciled": 0, "errors": 1}

    have = {str(x["call_id"]) for x in (lg.data or []) if x.get("call_id")}
    reconciled = 0
    errors = 0
    for row in bc.data or []:
        cid = str(row.get("id") or "")
        if not cid or cid in have:
            continue
        uid = str(row.get("user_id") or "")
        bm = float(row.get("billable_minutes") or 0)
        if bm <= 0 or not uid:
            continue
        ended_raw = row.get("ended_at")
        if isinstance(ended_raw, str):
            event_ts = datetime.fromisoformat(ended_raw.replace("Z", "+00:00"))
        else:
            event_ts = datetime.now(timezone.utc)
        if event_ts.tzinfo is None:
            event_ts = event_ts.replace(tzinfo=timezone.utc)
        sub = get_active_subscription(supabase, uid)
        try:
            append_usage_ledger(
                supabase,
                user_id=uid,
                subscription_id=str(sub["id"]) if sub and sub.get("id") else None,
                call_id=cid,
                quantity_minutes=bm,
                source="reconciliation_job",
                event_ts=event_ts,
                subscription=sub,
            )
            reconciled += 1
            have.add(cid)
        except Exception as e:
            logger.warning("[reconcile] append failed call_id=%s: %s", cid, e)
            errors += 1
    return {"reconciled": reconciled, "errors": errors}
