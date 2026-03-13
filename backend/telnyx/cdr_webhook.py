"""
Telnyx CDR (Call Detail Record) webhook.
Receives call ended events, inserts into call_usage, increments quota, sends call_ended push.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from typing import Any

from config import settings
from supabase_client import create_service_role_client

logger = logging.getLogger(__name__)


def _round_to_six_second_increments(seconds: float) -> float:
    """Round duration to 6-second billing increments."""
    increments = max(0, int((seconds + 5) // 6))  # ceil(seconds/6)
    return (increments * 6) / 60.0


def _get_receptionist_by_phone(supabase, our_did: str) -> dict | None:
    """Look up active receptionist by DID (to for inbound, from for outbound)."""
    from utils.phone import get_lookup_variants

    variants = get_lookup_variants(our_did)
    for v in variants:
        res = supabase.table("receptionists").select("id, name, user_id").eq(
            "telnyx_phone_number", v
        ).eq("status", "active").limit(1).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]
        res = supabase.table("receptionists").select("id, name, user_id").eq(
            "inbound_phone_number", v
        ).eq("status", "active").limit(1).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]

    # Fallback: fetch all active and match by normalized digits
    res = supabase.table("receptionists").select(
        "id, name, user_id, telnyx_phone_number, inbound_phone_number"
    ).eq("status", "active").execute()
    to_digits = "".join(c for c in (variants[0] if variants else our_did) if c.isdigit())
    to_us10 = (
        to_digits[1:] if len(to_digits) == 11 and to_digits.startswith("1")
        else (to_digits if len(to_digits) == 10 else None)
    )

    for r in res.data or []:
        tn = (r.get("telnyx_phone_number") or "").replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
        ib = (r.get("inbound_phone_number") or "").replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
        tn_us10 = tn[1:] if len(tn) == 11 and tn.startswith("1") else (tn if len(tn) == 10 else "")
        ib_us10 = ib[1:] if len(ib) == 11 and ib.startswith("1") else (ib if len(ib) == 10 else "")
        match = (
            (tn and (tn == to_digits or (to_us10 and tn_us10 == to_us10)))
            or (ib and (ib == to_digits or (to_us10 and ib_us10 == to_us10)))
        )
        if match:
            return r
    return None


async def _send_call_ended_push_task(
    user_id: str,
    call_sid: str,
    receptionist_id: str,
    receptionist_name: str,
) -> None:
    """Run sync push in executor."""
    try:
        from push import send_call_ended_push
        await asyncio.to_thread(
            send_call_ended_push,
            user_id=user_id,
            call_sid=call_sid,
            receptionist_id=receptionist_id,
            receptionist_name=receptionist_name,
        )
    except Exception as e:
        logger.warning("call_ended push failed: %s", e)


def _parse_event(raw_body: bytes) -> dict | None:
    """Parse Telnyx event payload. Returns {event_type, data} or None."""
    try:
        parsed = json.loads(raw_body.decode("utf-8"))
        event_type = (
            parsed.get("event_type")
            or (parsed.get("data") or {}).get("event_type")
        )
        data = parsed.get("data") or parsed
        if not event_type:
            return None
        return {"event_type": event_type, "data": data}
    except Exception:
        return None


def _finalize_call_log(supabase, call_control_id: str, ended_at, duration_seconds: int) -> None:
    """Finalize call_logs on call.hangup: status=completed, ended_at, duration_seconds."""
    try:
        supabase.table("call_logs").update({
            "status": "completed",
            "ended_at": ended_at.isoformat() if hasattr(ended_at, "isoformat") else ended_at,
            "duration_seconds": duration_seconds,
        }).eq("call_control_id", call_control_id).execute()
        logger.debug("call_logs finalized for %s", call_control_id)
    except Exception as e:
        logger.warning("call_logs finalize failed: %s", e)


def _patch_call_log_cost(supabase, call_control_id: str, cost_cents: int) -> None:
    """Patch call_logs cost_cents on call.cost."""
    try:
        supabase.table("call_logs").update({"cost_cents": cost_cents}).eq("call_control_id", call_control_id).execute()
    except Exception as e:
        logger.warning("call_logs cost patch failed: %s", e)


async def handle_cdr_webhook(raw_body: bytes, headers: dict[str, str]) -> dict[str, Any]:
    """
    Handle Telnyx CDR webhook (call.call-ended, call.hangup, call.cost, call.recording.saved).
    Returns dict for JSON response.
    """
    event = _parse_event(raw_body)
    if not event:
        return {"received": True}

    event_type = event["event_type"]
    if event_type not in ("call.call-ended", "call.hangup", "call.cost", "call.recording.saved"):
        return {"received": True}

    data = event.get("data") or {}
    payload = data.get("payload") or data

    call_control_id = (
        payload.get("call_control_id")
        or payload.get("call_leg_id")
        or payload.get("call_session_id")
    )
    to_num = payload.get("to") or ""
    from_num = payload.get("from") or ""
    direction_str = (payload.get("direction") or "").lower()
    direction = "inbound" if direction_str.startswith("inbound") else "outbound"

    # Inbound: to = our DID. Outbound: from = our DID.
    our_did = to_num if direction == "inbound" else from_num
    if not call_control_id or not our_did:
        return {"received": True}

    supabase = create_service_role_client()

    # call.cost: patch cost_cents on call_logs
    if event_type == "call.cost":
        cost_cents = payload.get("cost_cents") or payload.get("cost") or 0
        if call_control_id:
            _patch_call_log_cost(supabase, call_control_id, int(cost_cents))
        return {"received": True}

    receptionist = _get_receptionist_by_phone(supabase, our_did)
    if not receptionist:
        # Still finalize call_logs if row exists (e.g. outbound)
        if call_control_id and event_type in ("call.call-ended", "call.hangup"):
            duration_ms = payload.get("duration_millis") or 0
            duration_seconds = max(0, int(duration_ms / 1000))
            ended_at_str = payload.get("ended_at")
            ended_at = datetime.fromisoformat(ended_at_str.replace("Z", "+00:00")) if ended_at_str else datetime.now()
            _finalize_call_log(supabase, call_control_id, ended_at, duration_seconds)
        return {"received": True}

    duration_ms = payload.get("duration_millis") or 0
    duration_seconds = max(0, int(duration_ms / 1000))
    billed_minutes = _round_to_six_second_increments(duration_seconds)

    ended_at_str = payload.get("ended_at")
    ended_at = datetime.fromisoformat(ended_at_str.replace("Z", "+00:00")) if ended_at_str else datetime.now()
    started_at_str = payload.get("started_at")
    if started_at_str:
        started_at = datetime.fromisoformat(started_at_str.replace("Z", "+00:00"))
    else:
        from datetime import timedelta
        started_at = ended_at - timedelta(milliseconds=duration_ms)

    insert_row = {
        "receptionist_id": receptionist["id"],
        "call_sid": call_control_id,
        "started_at": started_at.isoformat(),
        "ended_at": ended_at.isoformat(),
        "duration_seconds": duration_seconds,
        "direction": direction,
        "status": "completed",
        "billed_minutes": billed_minutes,
        "telnyx_call_control_id": call_control_id,
        "recording_consent_played": True,
    }
    if receptionist.get("user_id"):
        insert_row["user_id"] = receptionist["user_id"]

    # call_logs: finalize on call.hangup (every call counts, even 0 billable minutes)
    if call_control_id and event_type in ("call.call-ended", "call.hangup"):
        _finalize_call_log(supabase, call_control_id, ended_at, duration_seconds)

    inserted = True
    try:
        supabase.table("call_usage").insert(insert_row).execute()
    except Exception as e:
        error_msg = str(e)
        if "23505" in error_msg or "duplicate" in error_msg.lower() or "unique" in error_msg.lower():
            inserted = False
        else:
            logger.error("[telnyx/cdr] insertCallUsage failed: %s", e)
            return {"received": False, "error": error_msg}

    # Increment user_plans usage
    if (
        inserted
        and receptionist.get("user_id")
        and direction
        and billed_minutes > 0
    ):
        try:
            supabase.rpc(
                "increment_user_plan_usage",
                {
                    "p_user_id": receptionist["user_id"],
                    "p_direction": direction,
                    "p_minutes": billed_minutes,
                },
            ).execute()
        except Exception as e:
            logger.error("increment_user_plan_usage failed: %s", e)

    # Send call_ended push (fire-and-forget)
    if receptionist.get("user_id") and event_type in ("call.call-ended", "call.hangup"):
        try:
            asyncio.create_task(_send_call_ended_push_task(
                user_id=receptionist["user_id"],
                call_sid=call_control_id,
                receptionist_id=receptionist.get("id") or "",
                receptionist_name=receptionist.get("name") or "Receptionist",
            ))
        except Exception as e:
            logger.warning("call_ended push schedule failed: %s", e)

    return {"received": True}
