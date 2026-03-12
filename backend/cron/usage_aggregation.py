"""Aggregate call_usage into usage_snapshots for current month. Run daily via /api/cron/usage."""

from __future__ import annotations

import logging
from calendar import monthrange
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)


def _get_current_month_period() -> tuple[str, str]:
    now = datetime.utcnow()
    last_day = monthrange(now.year, now.month)[1]
    start = f"{now.year:04d}-{now.month:02d}-01"
    end = f"{now.year:04d}-{now.month:02d}-{last_day:02d}"
    return start, end


def aggregate_usage_for_current_month(supabase: Any) -> dict[str, int]:
    """
    Aggregate call_usage into usage_snapshots for the current month.
    Groups by user_id, receptionist_id. Upserts into usage_snapshots.
    Returns { updated, errors }.
    """
    period_start, period_end = _get_current_month_period()
    period_start_ts = f"{period_start}T00:00:00.000Z"
    period_end_ts = f"{period_end}T23:59:59.999Z"

    updated = 0
    errors = 0

    # Fetch call_usage for current month (must have user_id)
    r = (
        supabase.table("call_usage")
        .select("user_id, receptionist_id, duration_seconds, direction, payg_minutes")
        .gte("ended_at", period_start_ts)
        .lte("ended_at", period_end_ts)
        .not_.is_("user_id", "null")
        .execute()
    )
    rows = r.data or []

    # Group by (user_id, receptionist_id)
    groups: dict[tuple[str, str], dict] = {}
    for row in rows:
        user_id = row.get("user_id")
        rec_id = row.get("receptionist_id")
        if not user_id or not rec_id:
            continue
        key = (str(user_id), str(rec_id))
        if key not in groups:
            groups[key] = {
                "user_id": user_id,
                "receptionist_id": rec_id,
                "total_seconds": 0,
                "inbound_seconds": 0,
                "outbound_seconds": 0,
                "payg_minutes": 0.0,
            }
        dur = int(row.get("duration_seconds") or 0)
        groups[key]["total_seconds"] += dur
        direction = (row.get("direction") or "").strip().lower()
        if direction == "inbound":
            groups[key]["inbound_seconds"] += dur
        elif direction == "outbound":
            groups[key]["outbound_seconds"] += dur
        pm = float(row.get("payg_minutes") or 0)
        groups[key]["payg_minutes"] += pm

    # Get billing_plan and included_minutes for each user
    user_ids = list({g["user_id"] for g in groups.values()})
    plans_map: dict[str, dict] = {}
    if user_ids:
        up = supabase.table("user_plans").select("user_id, billing_plan").in_("user_id", user_ids).execute()
        for p in up.data or []:
            plans_map[str(p["user_id"])] = p
        us = supabase.table("users").select("id, billing_plan, billing_plan_metadata").in_("id", user_ids).execute()
        for u in us.data or []:
            uid = str(u["id"])
            meta = u.get("billing_plan_metadata") or {}
            included = meta.get("included_minutes")
            plans_map.setdefault(uid, {}).setdefault("billing_plan", u.get("billing_plan"))
            plans_map[uid]["included_minutes"] = included

    ts = datetime.utcnow().isoformat() + "Z"

    for (user_id, rec_id), agg in groups.items():
        plan_info = plans_map.get(user_id) or {}
        billing_plan = plan_info.get("billing_plan")
        included = plan_info.get("included_minutes")
        total_sec = agg["total_seconds"]
        total_min = total_sec / 60.0
        overage_min = 0
        if included is not None and billing_plan != "subscription_payg":
            overage_min = max(0, int(total_min) - included)

        payload = {
            "user_id": user_id,
            "receptionist_id": rec_id,
            "period_start": period_start,
            "period_end": period_end,
            "total_seconds": agg["total_seconds"],
            "inbound_seconds": agg["inbound_seconds"],
            "outbound_seconds": agg["outbound_seconds"],
            "overage_minutes": overage_min,
            "payg_minutes": round(agg["payg_minutes"], 4),
            "billing_plan": billing_plan,
            "included_minutes": included,
            "updated_at": ts,
        }

        try:
            supabase.table("usage_snapshots").upsert(
                payload,
                on_conflict="receptionist_id,period_start",
            ).execute()
            updated += 1
        except Exception as e:
            logger.exception("[usage-aggregation] Upsert failed for %s/%s: %s", user_id, rec_id, e)
            errors += 1

    return {"updated": updated, "errors": errors}
