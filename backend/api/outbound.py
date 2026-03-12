"""
Outbound call API. Validates Bearer token, quota, then creates Telnyx call.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx
from fastapi import HTTPException
from supabase import create_client

from config import settings
from quota import check_outbound_quota
from supabase_client import create_service_role_client

logger = logging.getLogger(__name__)
TELNYX_API = "https://api.telnyx.com/v2"


def _to_e164(phone: str) -> str:
    """Normalize phone to E.164."""
    digits = re.sub(r"\D", "", phone.strip())
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return phone if phone.startswith("+") else f"+{digits}"


def _get_user_from_token(token: str) -> dict | None:
    """Validate Bearer token and return user. Returns None if invalid."""
    url = settings.get_supabase_url()
    anon_key = (settings.next_public_supabase_anon_key or "").strip()
    if not url or not anon_key:
        logger.warning("Supabase anon key not configured for outbound auth")
        return None
    try:
        client = create_client(url, anon_key, options={
            "global": {"headers": {"Authorization": f"Bearer {token}"}},
        })
        # get_user() uses the Authorization header we set
        resp = client.auth.get_user()
        user = getattr(resp, "user", None) if resp else None
        if user:
            return {"id": str(getattr(user, "id", "")), "email": getattr(user, "email", None)}
    except Exception as e:
        logger.debug("Token validation failed: %s", e)
    return None


def create_outbound_call(
    access_token: str,
    receptionist_id: str,
    to_phone: str,
) -> dict[str, Any]:
    """
    Initiate outbound call. Raises HTTPException on error.
    Returns {"call_control_id": str, "ok": True}.
    """
    user = _get_user_from_token(access_token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    supabase = create_service_role_client()

    # Quota check
    quota = check_outbound_quota(supabase, user["id"])
    if not quota.get("allowed"):
        raise HTTPException(
            status_code=403,
            detail=quota.get("reason") or "Quota exceeded",
        )

    # Lookup receptionist
    res = supabase.table("receptionists").select(
        "id, telnyx_phone_number, user_id"
    ).eq("id", receptionist_id).eq("user_id", user["id"]).limit(1).execute()

    if not res.data or len(res.data) == 0:
        raise HTTPException(
            status_code=404,
            detail="Receptionist not found or has no Telnyx number",
        )
    rec = res.data[0]
    from_number = rec.get("telnyx_phone_number")
    if not from_number:
        raise HTTPException(
            status_code=404,
            detail="Receptionist has no Telnyx number",
        )

    # Webhook base URL
    base = (settings.telnyx_webhook_base_url or settings.next_public_app_url or "").strip().rstrip("/")
    if not base or "localhost" in base or "127.0.0.1" in base:
        raise HTTPException(
            status_code=503,
            detail="TELNYX_WEBHOOK_BASE_URL not configured",
        )

    api_key = (settings.telnyx_api_key or "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Server misconfiguration")

    connection_id = (settings.telnyx_connection_id or "").strip()

    if not connection_id:
        raise HTTPException(
            status_code=503,
            detail="TELNYX_CONNECTION_ID required for outbound calls",
        )

    to_e164 = _to_e164(to_phone)
    webhook_url = f"{base}/api/telnyx/voice"

    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.post(
                f"{TELNYX_API}/calls",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "connection_id": connection_id,
                    "to": to_e164,
                    "from": from_number,
                    "webhook_url": webhook_url,
                },
            )
            if not r.is_success:
                err_text = r.text[:500] if r.text else "Unknown error"
                logger.error("Telnyx create_call failed: %s %s", r.status_code, err_text)
                raise HTTPException(
                    status_code=500,
                    detail=err_text or "Telnyx create call failed",
                )
            data = r.json()
            call_id = (data.get("data") or {}).get("call_control_id")
            if not call_id:
                raise HTTPException(
                    status_code=500,
                    detail="Telnyx returned no call_control_id",
                )
            return {"call_control_id": call_id, "ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Outbound call failed")
        raise HTTPException(status_code=500, detail=str(e))
