"""Mobile agenda: today's schedule for one receptionist."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from api.auth import get_user_from_request
from api.mobile.call_logs_projection import is_missing_column_error

logger = logging.getLogger(__name__)
router = APIRouter()

AGENDA_SELECT_FULL = (
    "id, start_time, end_time, summary, caller_number, service_name, status"
)
AGENDA_SELECT_BASE = "id, start_time, end_time, summary, service_name"

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _require_auth(request: Request) -> tuple[dict | None, Any]:
    user, supabase = get_user_from_request(request)
    if not user or not supabase:
        return (None, None)
    return (user, supabase)


def _assert_receptionist_ownership(receptionist_id: str, user_id: str, supabase) -> str | None:
    try:
        r = (
            supabase.table("receptionists")
            .select("id, user_id")
            .eq("id", receptionist_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.warning("[agenda] receptionist ownership lookup failed receptionist_id=%s: %s", receptionist_id, e)
        return "Receptionist not found"
    rows = r.data if r and isinstance(r.data, list) else []
    if not rows:
        return "Receptionist not found"
    if (rows[0] or {}).get("user_id") != user_id:
        return "Receptionist not found"
    return None


def _local_day_bounds_utc(date_str: str, offset_minutes: int) -> tuple[datetime, datetime]:
    y, m, d = map(int, date_str.split("-"))
    tz = timezone(timedelta(minutes=offset_minutes))
    start_local = datetime(y, m, d, 0, 0, 0, tzinfo=tz)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def _utc_midnight_bounds(date_str: str) -> tuple[datetime, datetime]:
    y, m, d = map(int, date_str.split("-"))
    start = datetime(y, m, d, 0, 0, 0, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    return start, end


def _attach_is_past(rows: list[dict], now_utc: datetime) -> None:
    for row in rows:
        is_past = False
        end_raw = row.get("end_time")
        if end_raw:
            try:
                end_s = end_raw if isinstance(end_raw, str) else str(end_raw)
                end_dt = datetime.fromisoformat(end_s.replace("Z", "+00:00"))
                if end_dt.tzinfo is None:
                    end_dt = end_dt.replace(tzinfo=timezone.utc)
                is_past = end_dt < now_utc
            except (TypeError, ValueError):
                pass
        row["is_past"] = is_past


@router.get("/agenda/today")
async def agenda_today(request: Request):
    """Appointments for one local calendar day, sorted by start_time."""
    user, supabase = _require_auth(request)
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    receptionist_id = (request.query_params.get("receptionist_id") or "").strip()
    if not receptionist_id:
        return JSONResponse({"error": "receptionist_id required"}, status_code=400)

    err = _assert_receptionist_ownership(receptionist_id, user["id"], supabase)
    if err:
        return JSONResponse({"error": err}, status_code=404)

    date_str = (request.query_params.get("date") or "").strip()
    if not date_str:
        date_str = datetime.now(timezone.utc).date().isoformat()
    if not _DATE_RE.match(date_str):
        return JSONResponse({"error": "date must be YYYY-MM-DD"}, status_code=400)

    offset_raw = request.query_params.get("offset_minutes")
    if offset_raw is not None and str(offset_raw).strip() != "":
        try:
            offset_minutes = int(offset_raw)
        except ValueError:
            return JSONResponse({"error": "offset_minutes must be an integer"}, status_code=400)
        start_utc, end_utc = _local_day_bounds_utc(date_str, offset_minutes)
    else:
        start_utc, end_utc = _utc_midnight_bounds(date_str)

    start_iso = start_utc.isoformat().replace("+00:00", "Z")
    end_iso = end_utc.isoformat().replace("+00:00", "Z")

    appointments: list[dict] = []
    try:
        q = (
            supabase.table("appointments")
            .select(AGENDA_SELECT_FULL)
            .eq("receptionist_id", receptionist_id)
            .gte("start_time", start_iso)
            .lt("start_time", end_iso)
            .order("start_time", desc=False)
        )
        rows = q.execute()
        appointments = [dict(r) for r in (rows.data or [])]
    except Exception as e:
        if is_missing_column_error(e):
            logger.warning("[agenda] schema fallback (030): %s", str(e)[:200])
            try:
                q = (
                    supabase.table("appointments")
                    .select(AGENDA_SELECT_BASE)
                    .eq("receptionist_id", receptionist_id)
                    .gte("start_time", start_iso)
                    .lt("start_time", end_iso)
                    .order("start_time", desc=False)
                )
                rows = q.execute()
                appointments = [dict(r) for r in (rows.data or [])]
                for a in appointments:
                    a.setdefault("caller_number", None)
                    a.setdefault("status", "needs_review")
            except Exception as retry_exc:
                logger.exception("[agenda] fallback failed: %s", retry_exc)
                return JSONResponse({"error": "Failed to load agenda"}, status_code=500)
        else:
            logger.exception("[agenda] query failed: %s", e)
            return JSONResponse({"error": "Failed to load agenda"}, status_code=500)

    now_utc = datetime.now(timezone.utc)
    _attach_is_past(appointments, now_utc)

    return {"appointments": appointments}
