"""Telnyx voice webhook: answer call and start streaming."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from config import settings
from prompts.fetch import set_prompt, _build_from_supabase_sync
from supabase_client import create_service_role_client
from telnyx.webhook import validate_telnyx_webhook

logger = logging.getLogger(__name__)
TELNYX_API = "https://api.telnyx.com/v2"


async def _send_incoming_call_push(
    user_id: str,
    call_control_id: str,
    caller: str,
    receptionist_id: str,
    receptionist_name: str,
) -> None:
    """Send FCM push for incoming call. Prefer backend firebase-admin, fallback to Next.js API."""
    if (settings.firebase_service_account_key or "").strip():
        try:
            from push import send_incoming_call_push
            sent = await asyncio.to_thread(
                send_incoming_call_push,
                user_id=user_id,
                call_sid=call_control_id,
                caller=caller,
                receptionist_id=receptionist_id or "",
                receptionist_name=receptionist_name,
            )
            if sent > 0:
                return
        except Exception as e:
            logger.warning("Backend FCM push failed: %s, trying Next.js fallback", e)

    # Fallback: Next.js internal API
    base = (settings.app_api_base_url or "").strip().rstrip("/")
    key = (settings.internal_api_key or "").strip()
    if not base or not key:
        logger.warning("Call push skipped: no Firebase and no APP_API_BASE_URL/INTERNAL_API_KEY")
        return
    payload = {
        "user_id": user_id,
        "call_sid": call_control_id,
        "caller": caller,
        "receptionist_id": receptionist_id or "",
        "receptionist_name": receptionist_name,
        "type": "incoming_call",
    }
    await _send_call_push_via_nextjs(base, key, payload)


async def _send_call_push_via_nextjs(base: str, key: str, payload: dict) -> None:
    """Send FCM push via Next.js internal API. Retries once on failure."""
    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.post(
                    f"{base}/api/internal/send-call-push",
                    headers={"x-internal-api-key": key, "Content-Type": "application/json"},
                    json=payload,
                )
                if r.is_success:
                    logger.info("Call push sent via Next.js: %s", r.json())
                    return
                logger.warning("Call push failed (attempt %d): %s %s", attempt + 1, r.status_code, r.text)
        except Exception as e:
            logger.warning("Call push error (attempt %d): %s", attempt + 1, e)
        if attempt == 0:
            await asyncio.sleep(0.5)


def _get_receptionist_by_phone(supabase, to_number: str) -> dict | None:
    """Look up active receptionist by called (To) number."""
    from utils.phone import get_lookup_variants

    variants = get_lookup_variants(to_number)
    for v in variants:
        res = supabase.table("receptionists").select("id, name, user_id").eq("telnyx_phone_number", v).eq("status", "active").limit(1).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]
        res = supabase.table("receptionists").select("id, name, user_id").eq("inbound_phone_number", v).eq("status", "active").limit(1).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]

    # Fallback: fetch all active and match by normalized digits
    res = supabase.table("receptionists").select("id, name, user_id, telnyx_phone_number, inbound_phone_number").eq("status", "active").execute()
    to_digits = "".join(c for c in (variants[0] if variants else to_number) if c.isdigit())
    to_us10 = to_digits[1:] if len(to_digits) == 11 and to_digits.startswith("1") else (to_digits if len(to_digits) == 10 else None)

    for r in res.data or []:
        tn = (r.get("telnyx_phone_number") or "").replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
        ib = (r.get("inbound_phone_number") or "").replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
        tn_us10 = tn[1:] if len(tn) == 11 and tn.startswith("1") else (tn if len(tn) == 10 else "")
        ib_us10 = ib[1:] if len(ib) == 11 and ib.startswith("1") else (ib if len(ib) == 10 else "")
        match = (tn and (tn == to_digits or (to_us10 and tn_us10 == to_us10))) or (ib and (ib == to_digits or (to_us10 and ib_us10 == to_us10)))
        if match:
            return r
    return None


async def handle_voice_webhook(body: dict[str, Any], raw_body: bytes) -> dict[str, Any]:
    """
    Handle Telnyx call.initiated webhook.
    Returns dict for JSON response.
    """
    event_type = (body.get("data") or {}).get("event_type") or body.get("event_type")
    if event_type != "call.initiated":
        return {"success": True}

    data = body.get("data") or {}
    payload = data.get("payload") or data
    call_control_id = payload.get("call_control_id") or data.get("call_control_id")
    to_number = payload.get("to") or ""
    from_number = payload.get("from") or ""

    if not call_control_id:
        return {"success": True}

    supabase = create_service_role_client()
    receptionist = _get_receptionist_by_phone(supabase, to_number)
    if not receptionist:
        fallback = supabase.table("receptionists").select("id").eq("status", "active").limit(1).execute()
        if fallback.data and len(fallback.data) > 0:
            receptionist = fallback.data[0]
            logger.warning("No receptionist for DID %s, using fallback %s", to_number, receptionist.get("id"))

    receptionist_id = receptionist.get("id", "") if receptionist else ""
    user_id = receptionist.get("user_id") if receptionist else None
    receptionist_name = receptionist.get("name", "Receptionist") if receptionist else "Receptionist"

    # Check inbound quota for fixed-plan users before answering
    if user_id:
        base = (settings.app_api_base_url or "").strip().rstrip("/")
        key = (settings.internal_api_key or "").strip()
        if base and key:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    r = await client.post(
                        f"{base}/api/internal/check-inbound-quota",
                        headers={"x-internal-api-key": key, "Content-Type": "application/json"},
                        json={"user_id": user_id},
                    )
                    if r.is_success:
                        data = r.json()
                        if not data.get("allowed"):
                            logger.warning("Inbound quota exceeded for user %s, rejecting call", user_id)
                            async with httpx.AsyncClient(timeout=5.0) as rej_client:
                                await rej_client.post(
                                    f"{TELNYX_API}/calls/{call_control_id}/actions/reject",
                                    headers={"Authorization": f"Bearer {settings.telnyx_api_key}", "Content-Type": "application/json"},
                                    json={},
                                )
                            return {"success": True}
            except Exception as e:
                logger.warning("Inbound quota check failed: %s, allowing call", e)

    # Send FCM push to user's mobile devices (fire-and-forget)
    if user_id:
        asyncio.create_task(
            _send_incoming_call_push(
                user_id=user_id,
                call_control_id=call_control_id,
                caller=from_number,
                receptionist_id=receptionist_id,
                receptionist_name=receptionist_name,
            )
        )

    # Pre-fetch and cache prompt
    try:
        prompt, greeting = _build_from_supabase_sync(receptionist_id, supabase)
        set_prompt(call_control_id, prompt, greeting)
        logger.info("Prompt cached for call %s", call_control_id)
    except Exception as e:
        logger.warning("Prompt pre-fetch failed: %s", e)

    api_key = settings.telnyx_api_key
    if not api_key:
        logger.error("TELNYX_API_KEY not set")
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="Server misconfiguration")

    ws_base = settings.get_telnyx_ws_base()
    params = f"call_sid={call_control_id}&direction=inbound&caller_phone={from_number}"
    if receptionist_id:
        params += f"&receptionist_id={receptionist_id}"
    stream_url = f"{ws_base}/api/voice/stream?{params}"
    logger.info("Stream URL for %s: %s", call_control_id, stream_url)

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Answer
        answer_resp = await client.post(
            f"{TELNYX_API}/calls/{call_control_id}/actions/answer",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={},
        )
        if answer_resp.is_success:
            logger.info("Answered call %s", call_control_id)
        else:
            logger.error("Answer failed: %s", answer_resp.text)

        # Start streaming
        stream_resp = await client.post(
            f"{TELNYX_API}/calls/{call_control_id}/actions/streaming_start",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "stream_url": stream_url,
                "stream_bidirectional_mode": "rtp",
            },
        )
        if stream_resp.is_success:
            logger.info("Stream started for %s", call_control_id)
        else:
            logger.error("Stream start failed: %s", stream_resp.text)

    return {"success": True}
