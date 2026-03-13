"""Telnyx voice webhook: answer call and start streaming."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from config import settings
from prompts.fetch import set_prompt, _build_from_supabase_sync
from quota import check_inbound_quota
from supabase_client import create_service_role_client
from telnyx.webhook import validate_telnyx_webhook

logger = logging.getLogger(__name__)
TELNYX_API = "https://api.telnyx.com/v2"

# Pending stream URLs: call_control_id -> stream_url (for call.answered)
# Streaming is deferred until call.answered to avoid 90034 "Call not answered yet"
_pending_streams: dict[str, str] = {}


async def _send_incoming_call_push(
    user_id: str,
    call_control_id: str,
    caller: str,
    receptionist_id: str,
    receptionist_name: str,
) -> None:
    """Send FCM push for incoming call via backend firebase-admin."""
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
        if sent == 0 and not (settings.firebase_service_account_key or "").strip():
            logger.warning("Call push skipped: FIREBASE_SERVICE_ACCOUNT_KEY not set")
    except Exception as e:
        logger.warning("FCM push failed: %s", e)


def _get_receptionist_by_phone(supabase, our_did: str) -> dict | None:
    """Look up active receptionist by our DID (to for inbound, from for outbound)."""
    from utils.phone import get_lookup_variants

    variants = get_lookup_variants(our_did)
    for v in variants:
        res = supabase.table("receptionists").select("id, name, user_id").eq("telnyx_phone_number", v).eq("status", "active").limit(1).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]
        res = supabase.table("receptionists").select("id, name, user_id").eq("inbound_phone_number", v).eq("status", "active").limit(1).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]

    # Fallback: fetch all active and match by normalized digits
    res = supabase.table("receptionists").select("id, name, user_id, telnyx_phone_number, inbound_phone_number").eq("status", "active").execute()
    to_digits = "".join(c for c in (variants[0] if variants else our_did) if c.isdigit())
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


async def _send_streaming_start(call_control_id: str, stream_url: str) -> bool:
    """Send streaming_start. Returns True on success. Retries on 90034 with backoff."""
    api_key = settings.telnyx_api_key
    if not api_key:
        return False
    max_retries = 5
    delay_ms = 300
    async with httpx.AsyncClient(timeout=15.0) as client:
        for attempt in range(max_retries):
            resp = await client.post(
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
            if resp.is_success:
                logger.info("Stream started for %s", call_control_id)
                return True
            try:
                err_body = resp.json()
                errors = err_body.get("errors") or []
                code = (errors[0].get("code") if errors else None) or ""
                if code == "90034" and attempt < max_retries - 1:
                    await asyncio.sleep(delay_ms / 1000.0)
                    delay_ms = min(int(delay_ms * 1.5), 2000)
                    continue
            except Exception:
                pass
            logger.error("Stream start failed: %s", resp.text)
            return False
    return False


def _insert_call_log(
    supabase,
    call_control_id: str,
    receptionist_id: str,
    user_id: str,
    from_number: str,
    to_number: str,
    direction: str,
) -> None:
    """Insert call_logs row on call.initiated."""
    try:
        supabase.table("call_logs").insert({
            "call_control_id": call_control_id,
            "receptionist_id": receptionist_id,
            "user_id": user_id,
            "from_number": from_number or None,
            "to_number": to_number or None,
            "direction": direction,
            "status": "initiated",
        }).execute()
        logger.info("call_logs inserted for %s", call_control_id)
    except Exception as e:
        logger.warning("call_logs insert failed: %s", e)


def _update_call_log(supabase, call_control_id: str, updates: dict) -> None:
    """Update call_logs row by call_control_id."""
    try:
        supabase.table("call_logs").update(updates).eq("call_control_id", call_control_id).execute()
    except Exception as e:
        logger.warning("call_logs update failed: %s", e)


async def handle_voice_webhook(body: dict[str, Any], raw_body: bytes) -> dict[str, Any]:
    """
    Handle Telnyx voice webhooks: call.initiated (answer + defer streaming),
    call.answered (send streaming_start), streaming.started (update call_logs).
    Returns dict for JSON response.
    """
    event_type = (body.get("data") or {}).get("event_type") or body.get("event_type")
    data = body.get("data") or {}
    payload = data.get("payload") or data
    call_control_id = payload.get("call_control_id") or data.get("call_control_id")
    supabase = create_service_role_client()

    # call.answered: send streaming_start (deferred from call.initiated), update call_logs
    if event_type == "call.answered" and call_control_id:
        _update_call_log(supabase, call_control_id, {"status": "answered", "answered_at": datetime.now(timezone.utc).isoformat()})
        stream_url = _pending_streams.pop(call_control_id, None)
        if stream_url:
            await _send_streaming_start(call_control_id, stream_url)
        return {"success": True}

    # streaming.started: update call_logs
    if event_type == "streaming.started" and call_control_id:
        _update_call_log(supabase, call_control_id, {"status": "streaming", "streaming_started_at": datetime.now(timezone.utc).isoformat()})
        return {"success": True}

    if event_type != "call.initiated" or not call_control_id:
        return {"success": True}

    to_number = payload.get("to") or ""
    from_number = payload.get("from") or ""
    direction_str = (payload.get("direction") or "inbound").lower()
    direction = "inbound" if "inbound" in direction_str else "outbound"
    our_did = to_number if direction == "inbound" else from_number

    receptionist = _get_receptionist_by_phone(supabase, our_did)
    if not receptionist:
        fallback = supabase.table("receptionists").select("id").eq("status", "active").limit(1).execute()
        if fallback.data and len(fallback.data) > 0:
            receptionist = fallback.data[0]
            logger.warning("No receptionist for DID %s, using fallback %s", our_did, receptionist.get("id"))

    receptionist_id = receptionist.get("id", "") if receptionist else ""
    user_id = receptionist.get("user_id") if receptionist else None
    receptionist_name = receptionist.get("name", "Receptionist") if receptionist else "Receptionist"

    # call_logs: insert on call.initiated (every call counts, even short/rejected)
    if receptionist_id and user_id:
        _insert_call_log(supabase, call_control_id, receptionist_id, str(user_id), from_number, to_number, direction)

    # Check inbound quota for fixed-plan users before answering
    if user_id:
        try:
            result = check_inbound_quota(supabase, user_id)
            if not result.get("allowed"):
                logger.warning("Inbound quota exceeded for user %s, rejecting call", user_id)
                _update_call_log(supabase, call_control_id, {"status": "rejected"})
                async with httpx.AsyncClient(timeout=5.0) as client:
                    await client.post(
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

    # Pre-fetch and cache prompt, greeting, voice_id (precedence applied in fetch)
    try:
        prompt, greeting, voice_id = _build_from_supabase_sync(receptionist_id, supabase)
        set_prompt(call_control_id, prompt, greeting, voice_id)
        logger.info("Prompt cached for call %s (voice_id=%s)", call_control_id, "custom" if voice_id else "env_default")
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
            _pending_streams[call_control_id] = stream_url
        else:
            logger.error("Answer failed: %s", answer_resp.text)

    return {"success": True}
