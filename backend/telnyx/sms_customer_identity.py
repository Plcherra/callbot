"""Customer-facing SMS display name: business first, then receptionist, then generic fallback."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# Used when neither account business name nor receptionist name is set.
SMS_DISPLAY_NAME_FALLBACK = "your service provider"


def fetch_customer_sms_display_name(supabase: Any, receptionist_id: str) -> str:
    """
    Priority: users.business_name -> receptionists.name -> SMS_DISPLAY_NAME_FALLBACK.
    """
    if not supabase or not receptionist_id:
        return SMS_DISPLAY_NAME_FALLBACK
    try:
        res = (
            supabase.table("receptionists")
            .select("name, users(business_name)")
            .eq("id", receptionist_id)
            .limit(1)
            .execute()
        )
        if not res or not getattr(res, "data", None):
            return SMS_DISPLAY_NAME_FALLBACK
        row = res.data[0] or {}
        u = row.get("users")
        business: str | None = None
        if isinstance(u, dict):
            business = u.get("business_name")  # type: ignore[assignment]
        elif isinstance(u, list) and u and isinstance(u[0], dict):
            business = u[0].get("business_name")
        if isinstance(business, str) and business.strip():
            return business.strip()
        rn = row.get("name")
        if isinstance(rn, str) and rn.strip():
            return rn.strip()
    except Exception:
        logger.exception(
            "[SMS_ID] fetch_customer_sms_display_name failed receptionist_id=%s",
            receptionist_id,
        )
    return SMS_DISPLAY_NAME_FALLBACK


def apply_sms_template_vars(text: str | None, display_name: str) -> str | None:
    """Replace {business_name} with display_name (after message body is fully built)."""
    if text is None:
        return None
    name = (display_name or "").strip() or SMS_DISPLAY_NAME_FALLBACK
    return str(text).replace("{business_name}", name)
