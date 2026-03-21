"""Usage threshold alerts (50%, 80%, 100%, 130% of included minutes)."""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

THRESHOLDS = (50, 80, 100, 130)


def run_usage_threshold_alerts(supabase: Any) -> dict[str, int]:
    """
    For users with user_plans + billing_plan_metadata.included_minutes, compare
    used_inbound + used_outbound to included. Log and record usage_alert_events once per threshold per period.
    """
    from calendar import monthrange

    today = date.today()
    period_start = today.replace(day=1).isoformat()
    last_d = monthrange(today.year, today.month)[1]
    period_end = date(today.year, today.month, last_d).isoformat()

    try:
        r = supabase.table("user_plans").select("user_id, billing_plan, used_inbound_minutes, used_outbound_minutes").execute()
    except Exception as e:
        logger.exception("[usage_alerts] user_plans fetch: %s", e)
        return {"alerts": 0, "errors": 1}

    alerts = 0
    errors = 0
    for row in r.data or []:
        uid = str(row.get("user_id") or "")
        if not uid or row.get("billing_plan") == "subscription_payg":
            continue
        ur = supabase.table("users").select("billing_plan_metadata").eq("id", uid).limit(1).execute()
        meta = (ur.data[0].get("billing_plan_metadata") or {}) if ur.data else {}
        included = int(meta.get("included_minutes") or 0)
        if included <= 0:
            continue
        used = float(row.get("used_inbound_minutes") or 0) + float(row.get("used_outbound_minutes") or 0)
        pct = (used / float(included)) * 100.0 if included else 0.0
        for th in THRESHOLDS:
            if pct < th:
                continue
            try:
                ex = (
                    supabase.table("usage_alert_events")
                    .select("id")
                    .eq("user_id", uid)
                    .eq("period_start", period_start)
                    .eq("period_end", period_end)
                    .eq("threshold_pct", th)
                    .limit(1)
                    .execute()
                )
                if ex.data and len(ex.data) > 0:
                    continue
                supabase.table("usage_alert_events").insert(
                    {
                        "user_id": uid,
                        "period_start": period_start,
                        "period_end": period_end,
                        "threshold_pct": th,
                        "alerted_at": datetime.now(timezone.utc).isoformat(),
                    }
                ).execute()
                logger.info(
                    "[usage_alert] user=%s threshold=%s%% used=%.2f included=%s",
                    uid,
                    th,
                    used,
                    included,
                )
                alerts += 1
            except Exception as e:
                err = str(e).lower()
                if "23505" in str(e) or "unique" in err:
                    pass
                else:
                    logger.warning("[usage_alerts] insert failed: %s", e)
                    errors += 1
    return {"alerts": alerts, "errors": errors}
