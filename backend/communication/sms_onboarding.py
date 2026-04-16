"""SMS / 10DLC onboarding state machine. Telnyx brand+campaign automation: TODO."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def activate_sms(supabase: Any, business_id: str) -> tuple[bool, str | None, str | None]:
    """
    not_started -> needs_submission
    Returns (ok, error_message, new_status).
    """
    res = supabase.table("sms_campaigns").select("id, status").eq("business_id", business_id).limit(1).execute()
    rows = res.data or []
    if not rows:
        return False, "SMS campaign row missing", None
    st = (rows[0].get("status") or "").strip()
    if st != "not_started":
        return False, f"SMS already {st}", None

    updates = {
        "status": "needs_submission",
        "failure_reason": None,
        "updated_at": _now_iso(),
    }
    supabase.table("sms_campaigns").update(updates).eq("business_id", business_id).execute()
    logger.info("[sms_onboarding] not_started -> needs_submission business_id=%s", business_id)
    return True, None, "needs_submission"


def submit_sms_registration(supabase: Any, business_id: str) -> tuple[bool, str | None, str | None]:
    """
    needs_submission -> pending_review (carrier / provider review; typical 1–2 business days).
    TODO: Telnyx 10DLC — call createBrand/createCampaign before moving to pending_review.
    """
    res = supabase.table("sms_campaigns").select("id, status").eq("business_id", business_id).limit(1).execute()
    rows = res.data or []
    if not rows:
        return False, "SMS campaign row missing", None
    st = (rows[0].get("status") or "").strip()
    if st != "needs_submission":
        return False, "Complete the previous SMS step first.", None

    updates = {
        "status": "pending_review",
        "failure_reason": None,
        "last_submitted_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    supabase.table("sms_campaigns").update(updates).eq("business_id", business_id).execute()
    logger.info("[sms_onboarding] needs_submission -> pending_review business_id=%s", business_id)
    return True, None, "pending_review"


def retry_sms(supabase: Any, business_id: str) -> tuple[bool, str | None, str | None]:
    """failed -> needs_submission"""
    res = supabase.table("sms_campaigns").select("id, status").eq("business_id", business_id).limit(1).execute()
    rows = res.data or []
    if not rows:
        return False, "SMS campaign row missing", None
    st = (rows[0].get("status") or "").strip()
    if st != "failed":
        return False, "Retry is only available after a failed registration.", None

    updates = {
        "status": "needs_submission",
        "failure_reason": None,
        "updated_at": _now_iso(),
    }
    supabase.table("sms_campaigns").update(updates).eq("business_id", business_id).execute()
    logger.info("[sms_onboarding] failed -> needs_submission business_id=%s", business_id)
    return True, None, "needs_submission"
