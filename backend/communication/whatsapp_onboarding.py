"""WhatsApp onboarding state machine. Embedded signup + webhooks: TODO."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def connect_whatsapp(supabase: Any, business_id: str) -> tuple[bool, str | None, dict[str, Any] | None]:
    """
    not_connected -> needs_connection
    Returns (ok, error, payload).
    """
    res = (
        supabase.table("whatsapp_accounts")
        .select("id, status")
        .eq("business_id", business_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return False, "WhatsApp row missing", None
    st = (rows[0].get("status") or "").strip()
    if st != "not_connected":
        return False, f"WhatsApp already {st}", None

    supabase.table("whatsapp_accounts").update(
        {"status": "needs_connection", "failure_reason": None, "updated_at": _now_iso()}
    ).eq("business_id", business_id).execute()
    logger.info("[whatsapp_onboarding] not_connected -> needs_connection business_id=%s", business_id)
    payload = {
        "status": "needs_connection",
        "next_step": "embedded_onboarding",
        "authorization_url": None,
    }
    return True, None, payload


def continue_whatsapp_setup(supabase: Any, business_id: str) -> tuple[bool, str | None, dict[str, Any] | None]:
    """
    needs_connection -> pending
    TODO: Telnyx embedded signup — return authorization_url when configured.
    """
    res = (
        supabase.table("whatsapp_accounts")
        .select("id, status")
        .eq("business_id", business_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return False, "WhatsApp row missing", None
    st = (rows[0].get("status") or "").strip()
    if st == "pending":
        return True, None, {
            "status": "pending",
            "next_step": "embedded_onboarding",
            "authorization_url": None,
        }
    if st != "needs_connection":
        return False, "Continue the previous WhatsApp step first.", None

    supabase.table("whatsapp_accounts").update(
        {"status": "pending", "failure_reason": None, "updated_at": _now_iso()}
    ).eq("business_id", business_id).execute()
    logger.info("[whatsapp_onboarding] needs_connection -> pending business_id=%s", business_id)
    return True, None, {
        "status": "pending",
        "next_step": "embedded_onboarding",
        "authorization_url": None,
    }


def retry_whatsapp(supabase: Any, business_id: str) -> tuple[bool, str | None, dict[str, Any] | None]:
    """failed -> needs_connection"""
    res = (
        supabase.table("whatsapp_accounts")
        .select("id, status")
        .eq("business_id", business_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return False, "WhatsApp row missing", None
    st = (rows[0].get("status") or "").strip()
    if st != "failed":
        return False, "Retry is only available after a failed connection.", None

    supabase.table("whatsapp_accounts").update(
        {"status": "needs_connection", "failure_reason": None, "updated_at": _now_iso()}
    ).eq("business_id", business_id).execute()
    logger.info("[whatsapp_onboarding] failed -> needs_connection business_id=%s", business_id)
    return True, None, {"status": "needs_connection", "next_step": "embedded_onboarding", "authorization_url": None}
