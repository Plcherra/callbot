"""WhatsApp: Telnyx signup session (best-effort), portal handoff, provider poll — honest states."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from telnyx import whatsapp_provider

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _extract_session_id(data: dict[str, Any]) -> str | None:
    for k in ("id", "signup_id", "signupId", "signupID"):
        v = data.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return None


def _extract_oauth_url(data: dict[str, Any]) -> str | None:
    for k in (
        "oauth_url",
        "authorization_url",
        "authorizationUrl",
        "facebook_oauth_url",
        "url",
        "signup_url",
    ):
        v = data.get(k)
        if v is not None and str(v).strip().startswith("http"):
            return str(v).strip()
    return None


def _signup_state_is_external_progress(state: str | None) -> bool:
    if not state:
        return False
    s = state.strip().lower()
    return s in (
        "facebook_auth",
        "waba_created",
        "phone_registered",
        "verified",
        "provisioning",
        "pending_verification",
    )


def _signup_state_is_terminal_failed(state: str | None) -> bool:
    if not state:
        return False
    return "fail" in state.lower()


def _whatsapp_phone_row_looks_active(row: dict[str, Any]) -> bool:
    s = str(row.get("status") or row.get("health") or row.get("operational_status") or "").lower()
    if any(x in s for x in ("active", "connected", "linked", "operational", "verified")):
        return True
    return False


def mark_whatsapp_pending_from_provider(
    supabase: Any,
    business_id: str,
    *,
    meta_business_id: str | None = None,
    whatsapp_number_id: str | None = None,
    signup_state: str | None = None,
) -> None:
    updates: dict[str, Any] = {
        "status": "pending",
        "failure_reason": None,
        "updated_at": _now_iso(),
        "last_provider_poll_at": _now_iso(),
    }
    if meta_business_id:
        updates["meta_business_id"] = meta_business_id.strip()
    if whatsapp_number_id:
        updates["whatsapp_number_id"] = whatsapp_number_id.strip()
    if signup_state:
        updates["signup_state"] = signup_state.strip()
    supabase.table("whatsapp_accounts").update(updates).eq("business_id", business_id).execute()
    logger.info("[whatsapp_onboarding] provider progress -> pending business_id=%s", business_id)


def mark_whatsapp_active_from_provider(
    supabase: Any,
    business_id: str,
    *,
    meta_business_id: str | None,
    whatsapp_number_id: str | None,
) -> None:
    supabase.table("whatsapp_accounts").update(
        {
            "status": "active",
            "failure_reason": None,
            "connected_at": _now_iso(),
            "updated_at": _now_iso(),
            "last_provider_poll_at": _now_iso(),
            "signup_state": "active",
            "meta_business_id": (meta_business_id or "").strip() or None,
            "whatsapp_number_id": (whatsapp_number_id or "").strip() or None,
        }
    ).eq("business_id", business_id).execute()
    logger.info("[whatsapp_onboarding] provider -> active business_id=%s", business_id)


def connect_whatsapp(supabase: Any, business_id: str) -> tuple[bool, str | None, dict[str, Any] | None]:
    """not_connected -> needs_connection with real handoff URL (API session or Telnyx portal)."""
    res = (
        supabase.table("whatsapp_accounts")
        .select("*")
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

    phone_res = (
        supabase.table("business_phone_numbers")
        .select("phone_number_e164, telnyx_number_id")
        .eq("business_id", business_id)
        .limit(1)
        .execute()
    )
    prow = (phone_res.data or [None])[0] or {}
    e164 = (prow.get("phone_number_e164") or "").strip() or None
    telnyx_pid = (prow.get("telnyx_number_id") or "").strip() or None

    session = whatsapp_provider.try_create_signup_session(
        phone_number_id=telnyx_pid,
        e164=e164,
    )

    updates: dict[str, Any] = {
        "status": "needs_connection",
        "failure_reason": None,
        "updated_at": _now_iso(),
    }
    payload: dict[str, Any] = {
        "status": "needs_connection",
        "next_step": "embedded_onboarding",
        "authorization_url": None,
    }

    if session:
        sid = _extract_session_id(session)
        url = _extract_oauth_url(session)
        state = (session.get("state") or session.get("status") or "").strip() or None
        if sid:
            updates["telnyx_signup_id"] = sid
        if url:
            updates["embedded_oauth_url"] = url
        if state:
            updates["signup_state"] = state
        payload["authorization_url"] = url
        payload["signup_id"] = sid

        if _signup_state_is_external_progress(state):
            supabase.table("whatsapp_accounts").update(updates).eq("business_id", business_id).execute()
            mark_whatsapp_pending_from_provider(
                supabase,
                business_id,
                signup_state=state,
            )
            payload["status"] = "pending"
            return True, None, payload

    if not payload.get("authorization_url"):
        portal = whatsapp_provider.portal_handoff_url()
        updates["embedded_oauth_url"] = portal
        updates["signup_state"] = "portal_handoff"
        payload["authorization_url"] = portal
        payload["message"] = (
            "Open Telnyx to run WhatsApp embedded signup for this number. "
            "EchoDesk will detect progress when you refresh status here."
        )

    supabase.table("whatsapp_accounts").update(updates).eq("business_id", business_id).execute()
    logger.info("[whatsapp_onboarding] not_connected -> needs_connection business_id=%s", business_id)
    return True, None, payload


def _poll_signup_and_phone(supabase: Any, business_id: str, wa: dict[str, Any]) -> dict[str, Any]:
    """Update DB from Telnyx signup status + WhatsApp phone list. Returns summary for client."""
    notes: list[str] = []
    phone_res = (
        supabase.table("business_phone_numbers")
        .select("phone_number_e164")
        .eq("business_id", business_id)
        .limit(1)
        .execute()
    )
    prow = (phone_res.data or [None])[0] or {}
    e164 = (prow.get("phone_number_e164") or "").strip() or None

    sid = (wa.get("telnyx_signup_id") or "").strip() or None
    if sid:
        st = whatsapp_provider.get_signup_status(sid)
        if st:
            state = (st.get("state") or st.get("status") or "").strip() or None
            supabase.table("whatsapp_accounts").update(
                {
                    "signup_state": state,
                    "last_provider_poll_at": _now_iso(),
                    "updated_at": _now_iso(),
                }
            ).eq("business_id", business_id).execute()
            waba = (st.get("whatsapp_business_account_id") or st.get("waba_id") or "").strip() or None
            wnid = (st.get("whatsapp_phone_number_id") or st.get("phone_number_id") or "").strip() or None
            if _signup_state_is_terminal_failed(state):
                supabase.table("whatsapp_accounts").update(
                    {
                        "status": "failed",
                        "failure_reason": state or "WhatsApp signup failed",
                        "updated_at": _now_iso(),
                    }
                ).eq("business_id", business_id).execute()
                notes.append("Provider reported a failed signup state.")
                return {"message": " ".join(notes), "signup_state": state}
            if _signup_state_is_external_progress(state):
                mark_whatsapp_pending_from_provider(
                    supabase,
                    business_id,
                    meta_business_id=waba,
                    whatsapp_number_id=wnid,
                    signup_state=state,
                )
                notes.append("Meta/Telnyx signup is in progress.")
            if state and state.lower() in ("active", "verified"):
                mark_whatsapp_active_from_provider(
                    supabase,
                    business_id,
                    meta_business_id=waba,
                    whatsapp_number_id=wnid,
                )
                notes.append("WhatsApp is active with your provider.")
                return {"message": " ".join(notes), "signup_state": state}

    if e164:
        try:
            rows = whatsapp_provider.list_all_whatsapp_phone_numbers()
            match = whatsapp_provider.find_whatsapp_row_for_e164(e164, rows)
            if match and _whatsapp_phone_row_looks_active(match):
                wid = str(match.get("id") or match.get("phone_number_id") or "").strip() or None
                waba = str(
                    match.get("whatsapp_business_account_id")
                    or match.get("business_account_id")
                    or ""
                ).strip() or None
                mark_whatsapp_active_from_provider(
                    supabase,
                    business_id,
                    meta_business_id=waba,
                    whatsapp_number_id=wid,
                )
                notes.append("Telnyx shows this business number on WhatsApp.")
        except Exception as ex:
            logger.warning("[whatsapp_onboarding] phone list poll: %s", ex)
            notes.append("Could not poll WhatsApp numbers from Telnyx yet.")

    return {"message": " ".join(notes) if notes else "No provider update yet. Complete Meta/Telnyx steps, then refresh."}


def continue_whatsapp_setup(supabase: Any, business_id: str) -> tuple[bool, str | None, dict[str, Any] | None]:
    res = (
        supabase.table("whatsapp_accounts")
        .select("*")
        .eq("business_id", business_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return False, "WhatsApp row missing", None
    wa = rows[0]
    st = (wa.get("status") or "").strip()

    if st == "pending":
        info = _poll_signup_and_phone(supabase, business_id, wa)
        return True, None, {"status": "pending", **info}

    if st == "needs_connection":
        info = _poll_signup_and_phone(supabase, business_id, wa)
        refreshed = (
            supabase.table("whatsapp_accounts").select("*").eq("business_id", business_id).limit(1).execute().data
            or []
        )
        new_st = (refreshed[0].get("status") if refreshed else st) or st
        return True, None, {
            "status": new_st,
            "authorization_url": (refreshed[0].get("embedded_oauth_url") if refreshed else None),
            **info,
        }

    if st == "active":
        return True, None, {"status": "active"}

    return False, "Continue the previous WhatsApp step first.", None


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
        {
            "status": "needs_connection",
            "failure_reason": None,
            "updated_at": _now_iso(),
            "telnyx_signup_id": None,
            "embedded_oauth_url": None,
            "signup_state": None,
        }
    ).eq("business_id", business_id).execute()
    logger.info("[whatsapp_onboarding] failed -> needs_connection business_id=%s", business_id)
    return True, None, {"status": "needs_connection", "next_step": "embedded_onboarding", "authorization_url": None}
