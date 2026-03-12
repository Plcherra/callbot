"""
Quota check for outbound and inbound calls.
Before initiating outbound, check remaining outbound minutes; block if 0.
Before answering inbound, check remaining inbound minutes; reject if 0.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from supabase import Client


def check_inbound_quota(supabase: "Client", user_id: str) -> dict:
    """
    Check if user has remaining inbound minutes.
    For PAYG users: always allowed (no quota).
    For fixed plans: check allocated_inbound_minutes - used_inbound_minutes.
    Returns {"allowed": bool, "remainingMinutes": float | None, "reason": str | None}
    """
    res = supabase.table("user_plans").select(
        "billing_plan, allocated_inbound_minutes, used_inbound_minutes"
    ).eq("user_id", user_id).limit(1).execute()

    plan = None
    if res.data and len(res.data) > 0:
        plan = res.data[0]

    if not plan:
        return {"allowed": True, "remainingMinutes": float("inf"), "reason": None}

    if plan.get("billing_plan") == "subscription_payg":
        return {"allowed": True, "remainingMinutes": float("inf"), "reason": None}

    allocated = plan.get("allocated_inbound_minutes") or 0
    used = float(plan.get("used_inbound_minutes") or 0)
    remaining = max(0, allocated - used)

    if remaining <= 0:
        return {
            "allowed": False,
            "remainingMinutes": 0,
            "reason": "No inbound minutes remaining this period",
        }

    return {"allowed": True, "remainingMinutes": remaining, "reason": None}


def check_outbound_quota(supabase: "Client", user_id: str) -> dict:
    """
    Check if user has remaining outbound minutes.
    For PAYG users: always allowed (no quota).
    For fixed plans: check allocated_outbound_minutes - used_outbound_minutes.
    Returns {"allowed": bool, "remainingMinutes": float | None, "reason": str | None}
    """
    res = supabase.table("user_plans").select(
        "billing_plan, allocated_outbound_minutes, used_outbound_minutes"
    ).eq("user_id", user_id).limit(1).execute()

    plan = None
    if res.data and len(res.data) > 0:
        plan = res.data[0]

    if not plan:
        return {"allowed": False, "remainingMinutes": None, "reason": "No plan configured"}

    if plan.get("billing_plan") == "subscription_payg":
        return {"allowed": True, "remainingMinutes": float("inf"), "reason": None}

    allocated = plan.get("allocated_outbound_minutes") or 0
    used = float(plan.get("used_outbound_minutes") or 0)
    remaining = max(0, allocated - used)

    if remaining <= 0:
        return {
            "allowed": False,
            "remainingMinutes": 0,
            "reason": "No outbound minutes remaining this period",
        }

    return {"allowed": True, "remainingMinutes": remaining, "reason": None}
