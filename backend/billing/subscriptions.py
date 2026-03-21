"""Subscription lookup and Stripe sync helpers."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def get_active_subscription(supabase: Any, user_id: str) -> dict[str, Any] | None:
    """Return newest trialing/active/past_due subscription for user."""
    try:
        r = (
            supabase.table("subscriptions")
            .select("*")
            .eq("user_id", user_id)
            .in_("status", ["trialing", "active", "past_due"])
            .execute()
        )
        rows = [x for x in (r.data or []) if isinstance(x, dict)]
        rows.sort(key=lambda x: str(x.get("created_at") or ""), reverse=True)
        if rows:
            return rows[0]
    except Exception as e:
        logger.warning("[subscriptions] lookup failed user=%s: %s", user_id, e)
    return None


def get_plan_id_for_code(supabase: Any, code: str) -> str | None:
    try:
        r = supabase.table("plans").select("id").eq("code", code).eq("is_active", True).limit(1).execute()
        if r.data and len(r.data) > 0:
            return str(r.data[0]["id"])
    except Exception as e:
        logger.warning("[subscriptions] plan lookup failed code=%s: %s", code, e)
    return None
