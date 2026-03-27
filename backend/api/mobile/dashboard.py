from __future__ import annotations

import logging
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from api.auth import get_user_from_request
from api.mobile.call_logs_projection import fetch_call_logs_with_fallback

logger = logging.getLogger(__name__)
router = APIRouter()


def _require_auth(request: Request) -> tuple[dict | None, object | None]:
    user, supabase = get_user_from_request(request)
    if not user or not supabase:
        return (None, None)
    return (user, supabase)


@router.get("/dashboard-summary")
async def dashboard_summary(request: Request):
    user, supabase = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    recs = supabase.table("receptionists").select("id").eq("user_id", user["id"]).execute()
    rec_ids = [r["id"] for r in (recs.data or [])] if recs and recs.data else []
    if not rec_ids:
        logger.info("[CALL_DIAG] dashboard-summary user_id=%s rec_count=0 (no receptionists)", user["id"])
        return {"total_calls": 0, "total_minutes": 0.0, "recent_calls": [], "usage_minutes_realtime": 0}

    # Real-time usage from user_plans (updated by CDR immediately; use when usage_snapshots not yet populated)
    usage_minutes_realtime = 0.0
    try:
        up = supabase.table("user_plans").select("used_inbound_minutes, used_outbound_minutes").eq("user_id", user["id"]).limit(1).execute()
        if up and up.data and len(up.data) > 0:
            row = up.data[0] if isinstance(up.data[0], dict) else {}
            inbound = float(row.get("used_inbound_minutes") or 0)
            outbound = float(row.get("used_outbound_minutes") or 0)
            usage_minutes_realtime = round(inbound + outbound, 2)
    except Exception as e:
        logger.debug("[dashboard-summary] user_plans read failed: %s", e)

    # Aggregate from call_logs via RPC (counts only status='completed')
    total_calls = 0
    total_seconds = 0
    try:
        rpc = supabase.rpc("get_dashboard_summary", {"p_user_id": user["id"]}).execute()
        raw = rpc.data if rpc else None
        if isinstance(raw, list) and len(raw) > 0:
            row = raw[0] if isinstance(raw[0], dict) else {}
        elif isinstance(raw, dict):
            row = raw
        else:
            row = {}
        total_calls = int(row.get("total_calls") or 0)
        total_seconds = int(row.get("total_seconds") or 0)
        logger.info(
            "[CALL_DIAG] dashboard-summary RPC user_id=%s total_calls=%s total_seconds=%s rec_count=%s",
            user["id"], total_calls, total_seconds, len(rec_ids),
        )
    except Exception as e:
        logger.warning("[CALL_DIAG] dashboard-summary RPC failed: %s", e)

    total_minutes = round(total_seconds / 60.0, 2) if total_seconds else 0.0

    recent_calls = []
    select_mode = "full"
    try:
        recent_calls, select_mode, degraded_reason = fetch_call_logs_with_fallback(
            supabase=supabase,
            receptionist_ids=rec_ids,
            limit=10,
            completed_only=True,
            diag_tag="dashboard-summary",
        )
        if degraded_reason:
            logger.info("[CALL_DIAG] dashboard-summary recent_calls degraded reason=%s", degraded_reason)
    except Exception as e:
        logger.warning("[CALL_DIAG] dashboard-summary recent_calls failed: %s", e)

    return {
        "total_calls": total_calls,
        "total_minutes": total_minutes,
        "recent_calls": recent_calls,
        "usage_minutes_realtime": usage_minutes_realtime,
        "recent_calls_select_mode": select_mode,
    }

