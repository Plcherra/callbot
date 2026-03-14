"""
Telnyx CDR (Call Detail Record) webhook.
Receives call ended events, inserts into call_usage, increments quota, sends call_ended push.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from config import settings
from supabase_client import create_service_role_client
from telnyx.payload_utils import extract_call_control_id
from telnyx.receptionist_lookup import get_receptionist_by_did

logger = logging.getLogger(__name__)


def _round_to_six_second_increments(seconds: float) -> float:
    """Round duration to 6-second billing increments."""
    increments = max(0, int((seconds + 5) // 6))  # ceil(seconds/6)
    return (increments * 6) / 60.0


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


def _get_call_log_row(supabase, call_control_id: str) -> dict | None:
    """Fetch call_logs row by call_control_id. Returns row dict or None."""
    try:
        sel = supabase.table("call_logs").select("id, started_at, answered_at").eq("call_control_id", call_control_id).limit(1).execute()
        if sel and sel.data and len(sel.data) > 0 and isinstance(sel.data[0], dict):
            return sel.data[0]
        return None
    except Exception as e:
        logger.warning("[CALL_DIAG] call_logs fetch failed: %s", e)
        return None


def _finalize_call_log(supabase, call_control_id: str, ended_at, duration_seconds: int) -> str | None:
    """Finalize call_logs on call.hangup: status=completed, ended_at, duration_seconds. Returns finalized row id if found."""
    try:
        row = _get_call_log_row(supabase, call_control_id)
        row_id = row.get("id") if row else None
        if not row:
            logger.warning(
                "[CALL_DIAG] call_logs finalize: no row for call_control_id=%s (insert skipped/failed or id mismatch - check voice webhook logs)",
                call_control_id,
            )
            return None
        result = supabase.table("call_logs").update({
            "status": "completed",
            "ended_at": ended_at.isoformat() if hasattr(ended_at, "isoformat") else str(ended_at),
            "duration_seconds": duration_seconds,
        }).eq("call_control_id", call_control_id).execute()
        rows_affected = len(result.data) if result and result.data else 0
        logger.info(
            "[CALL_DIAG] call_logs finalized id=%s call_control_id=%s duration_seconds=%s rows_affected=%s",
            row_id, call_control_id, duration_seconds, rows_affected,
        )
        return row_id
    except Exception as e:
        logger.warning("[CALL_DIAG] call_logs finalize failed call_control_id=%s: %s", call_control_id, e)
        return None


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
        logger.info("[CALL_DIAG] CDR: parse_event returned None")
        return {"received": True}

    event_type = event["event_type"]
    if event_type not in ("call.call-ended", "call.hangup", "call.cost", "call.recording.saved"):
        logger.info("[CALL_DIAG] CDR: ignoring event_type=%s", event_type)
        return {"received": True}

    data = event.get("data") or {}
    payload = data.get("payload") or data

    # Canonical extraction (must match voice_webhook for insert/finalize id consistency)
    call_control_id = extract_call_control_id(data, payload)
    call_session_id = payload.get("call_session_id") or data.get("call_session_id")
    call_leg_id = payload.get("call_leg_id") or data.get("call_leg_id")

    logger.info(
        "[CALL_DIAG] CDR received event_type=%s call_control_id=%s call_session_id=%s call_leg_id=%s payload_keys=%s",
        event_type, call_control_id, call_session_id, call_leg_id, list(payload.keys()) if isinstance(payload, dict) else [],
    )
    to_num = payload.get("to") or ""
    from_num = payload.get("from") or ""
    direction_str = (payload.get("direction") or "").lower()
    direction = "inbound" if direction_str.startswith("inbound") else "outbound"

    # Inbound: to = our DID. Outbound: from = our DID.
    our_did = to_num if direction == "inbound" else from_num
    if not call_control_id or not our_did:
        logger.warning(
            "[CALL_DIAG] CDR: missing call_control_id or our_did - call_control_id=%s our_did=%s from=%s to=%s",
            call_control_id, our_did, from_num, to_num,
        )
        return {"received": True}

    supabase = create_service_role_client()

    # call.cost: patch cost_cents on call_logs
    if event_type == "call.cost":
        cost_cents = payload.get("cost_cents") or payload.get("cost") or 0
        if call_control_id:
            _patch_call_log_cost(supabase, call_control_id, int(cost_cents))
        return {"received": True}

    def _parse_iso(s: str | None) -> datetime | None:
        if not s or not isinstance(s, str):
            return None
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None

    def _extract_duration_and_times(
        p: dict, sb, ccid: str
    ) -> tuple[int, datetime, datetime]:
        """
        Extract duration_seconds, ended_at, started_at.
        Priority: 1) duration_millis, 2) end_time - start_time from payload,
        3) ended_at - started_at from call_logs (authoritative fallback).
        """
        now_utc = datetime.now(timezone.utc)
        # Ended-at: payload fields (Telnyx uses various names)
        ended_at_str = (
            p.get("ended_at") or p.get("end_time") or p.get("hangup_time")
            or p.get("occurred_at") or p.get("timestamp")
        )
        ended_at = (_parse_iso(ended_at_str) if ended_at_str else None) or now_utc
        if ended_at.tzinfo is None:
            ended_at = ended_at.replace(tzinfo=timezone.utc)

        # Duration from payload
        duration_ms = p.get("duration_millis") or p.get("duration_ms") or 0
        started_at_from_payload = None
        start_str = p.get("started_at") or p.get("start_time") or p.get("answer_time") or p.get("created_at")
        if start_str:
            started_at_from_payload = _parse_iso(start_str)

        if duration_ms and duration_ms > 0:
            duration_seconds = max(0, int(duration_ms / 1000))
            started_at = started_at_from_payload or (ended_at - timedelta(milliseconds=duration_ms))
            logger.info("[CALL_DIAG] CDR duration from payload duration_millis=%s", duration_ms)
            return duration_seconds, ended_at, started_at

        if started_at_from_payload:
            st = started_at_from_payload
            if st.tzinfo is None:
                st = st.replace(tzinfo=timezone.utc)
            delta = ended_at - st
            duration_seconds = max(0, int(delta.total_seconds()))
            logger.info("[CALL_DIAG] CDR duration from payload end-start: %s s", duration_seconds)
            return duration_seconds, ended_at, st

        # Fallback: use call_logs.started_at (inserted on call.initiated)
        row = _get_call_log_row(sb, ccid)
        if row:
            started_at_raw = row.get("started_at")
            if started_at_raw:
                if isinstance(started_at_raw, str):
                    started_at = _parse_iso(started_at_raw) or now_utc
                else:
                    started_at = started_at_raw
                if started_at.tzinfo is None:
                    started_at = started_at.replace(tzinfo=timezone.utc)
                delta = ended_at - started_at
                duration_seconds = max(0, int(delta.total_seconds()))
                logger.info(
                    "[CALL_DIAG] CDR duration from call_logs.started_at: %s s (payload had no duration/start)",
                    duration_seconds,
                )
                return duration_seconds, ended_at, started_at

        logger.warning("[CALL_DIAG] CDR no duration source, using 0 (payload_keys=%s)", list(p.keys()) if isinstance(p, dict) else [])
        return 0, ended_at, ended_at

    receptionist = get_receptionist_by_did(supabase, our_did, direction)
    if not receptionist:
        # Still finalize call_logs if row exists (e.g. outbound)
        if call_control_id and event_type in ("call.call-ended", "call.hangup"):
            duration_seconds, ended_at, _ = _extract_duration_and_times(payload, supabase, call_control_id)
            logger.info("[CALL_DIAG] CDR no-receptionist finalize call_control_id=%s duration_seconds=%s", call_control_id, duration_seconds)
            _finalize_call_log(supabase, call_control_id, ended_at, duration_seconds)
        return {"received": True}

    duration_seconds, ended_at, started_at = _extract_duration_and_times(payload, supabase, call_control_id)
    billed_minutes = _round_to_six_second_increments(duration_seconds)
    logger.info("[CALL_DIAG] CDR duration aggregation call_control_id=%s duration_seconds=%s billed_minutes=%s", call_control_id, duration_seconds, billed_minutes)

    started_at_str = started_at.isoformat() if hasattr(started_at, "isoformat") else str(started_at)
    ended_at_str = ended_at.isoformat() if hasattr(ended_at, "isoformat") else str(ended_at)
    insert_row = {
        "receptionist_id": receptionist["id"],
        "call_sid": call_control_id,
        "started_at": started_at_str,
        "ended_at": ended_at_str,
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
    finalized_id = None
    if call_control_id and event_type in ("call.call-ended", "call.hangup"):
        finalized_id = _finalize_call_log(supabase, call_control_id, ended_at, duration_seconds)
        logger.info("[CALL_DIAG] CDR finalized call_logs id=%s for call_control_id=%s", finalized_id, call_control_id)

    inserted = True
    call_usage_id = None
    try:
        ins_result = supabase.table("call_usage").insert(insert_row).execute()
        if ins_result.data and len(ins_result.data) > 0:
            call_usage_id = ins_result.data[0].get("id")
        logger.info("[CALL_DIAG] call_usage inserted id=%s for call_control_id=%s duration_seconds=%s", call_usage_id, call_control_id, duration_seconds)
    except Exception as e:
        error_msg = str(e)
        if "23505" in error_msg or "duplicate" in error_msg.lower() or "unique" in error_msg.lower():
            logger.info("[CALL_DIAG] call_usage insert skipped (duplicate) for call_control_id=%s", call_control_id)
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
