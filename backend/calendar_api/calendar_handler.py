"""Voice Calendar API - Google Calendar operations."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

from config import settings
from google_oauth_scopes import SCOPES
from supabase_client import create_service_role_client

logger = logging.getLogger(__name__)

DEFAULT_SLOT_MINUTES = 30
DEFAULT_TIMEZONE = "America/New_York"


def _parse_datetime(date_str: str, timezone: str = DEFAULT_TIMEZONE) -> dict[str, str] | None:
    try:
        d = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        time_min = d.isoformat()
        time_max = (d + timedelta(days=1)).isoformat()
        return {"timeMin": time_min, "timeMax": time_max}
    except (ValueError, TypeError):
        return None


def _get_free_slots(
    busy: list[dict],
    time_min: str,
    time_max: str,
    slot_minutes: int,
) -> list[str]:
    slot_ms = slot_minutes * 60 * 1000
    try:
        min_ts = datetime.fromisoformat(time_min.replace("Z", "+00:00")).timestamp() * 1000
        max_ts = datetime.fromisoformat(time_max.replace("Z", "+00:00")).timestamp() * 1000
    except (ValueError, TypeError):
        return []

    busy_ranges = []
    for b in busy:
        start = b.get("start")
        end = b.get("end")
        if start and end:
            try:
                s = datetime.fromisoformat(start.replace("Z", "+00:00")).timestamp() * 1000
                e = datetime.fromisoformat(end.replace("Z", "+00:00")).timestamp() * 1000
                busy_ranges.append((s, e))
            except (ValueError, TypeError):
                pass
    busy_ranges.sort(key=lambda x: x[0])

    slots = []
    t = min_ts
    while t + slot_ms <= max_ts:
        slot_end = t + slot_ms
        overlaps = any(
            (t >= r[0] and t < r[1]) or (slot_end > r[0] and slot_end <= r[1]) or (t <= r[0] and slot_end >= r[1])
            for r in busy_ranges
        )
        if not overlaps:
            slots.append(datetime.fromtimestamp(t / 1000).isoformat())
        t = slot_end
    return slots


def _get_calendar_service(refresh_token: str):
    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=SCOPES,
    )
    creds.refresh(Request())
    return build("calendar", "v3", credentials=creds)


async def handle_calendar_request(body: dict) -> dict:
    """Handle POST /api/voice/calendar. Returns dict for JSON response."""
    from fastapi import HTTPException

    api_key = settings.voice_server_api_key
    if not api_key or not api_key.strip():
        raise HTTPException(status_code=503, detail="Calendar API not configured")

    receptionist_id = body.get("receptionist_id")
    action = body.get("action")
    params = body.get("params") or {}

    if not receptionist_id or not isinstance(receptionist_id, str):
        raise HTTPException(status_code=400, detail="receptionist_id required")
    if action not in ("check_availability", "create_appointment", "reschedule_appointment"):
        raise HTTPException(status_code=400, detail="action must be check_availability, create_appointment, or reschedule_appointment")

    supabase = create_service_role_client()
    rec_res = supabase.table("receptionists").select("id, user_id, calendar_id").eq("id", receptionist_id).execute()
    if not rec_res.data or len(rec_res.data) == 0:
        raise HTTPException(status_code=404, detail="Receptionist not found")

    rec = rec_res.data[0]
    user_res = supabase.table("users").select("calendar_refresh_token").eq("id", rec["user_id"]).execute()
    if not user_res.data or len(user_res.data) == 0 or not user_res.data[0].get("calendar_refresh_token"):
        return {
            "success": False,
            "error": "calendar_not_connected",
            "message": "Google Calendar is not connected for this receptionist.",
        }

    calendar_id = (rec.get("calendar_id") or "primary").strip() or "primary"
    refresh_token = user_res.data[0]["calendar_refresh_token"]

    try:
        service = _get_calendar_service(refresh_token)
    except Exception as e:
        msg = str(e)
        if "invalid_grant" in msg or "Token has been expired" in msg:
            return {
                "success": False,
                "error": "calendar_token_expired",
                "message": "Calendar access expired. Please reconnect Google Calendar.",
            }
        logger.exception("Calendar auth failed")
        return {"success": False, "error": "calendar_error", "message": "Calendar request failed."}

    try:
        if action == "check_availability":
            return _handle_check_availability(service, calendar_id, params)
        if action == "create_appointment":
            return _handle_create_appointment(service, calendar_id, params)
        return _handle_reschedule(service, calendar_id, params)
    except Exception as e:
        msg = str(e)
        if "invalid_grant" in msg or "Token has been expired" in msg:
            return {
                "success": False,
                "error": "calendar_token_expired",
                "message": "Calendar access expired. Please reconnect Google Calendar.",
            }
        logger.exception("Calendar error: %s", action)
        return {"success": False, "error": "calendar_error", "message": "Calendar request failed."}


def _handle_check_availability(service, calendar_id: str, params: dict) -> dict:
    start_date = params.get("start_date")
    end_date = params.get("end_date")
    duration_minutes = params.get("duration_minutes") or DEFAULT_SLOT_MINUTES
    if isinstance(duration_minutes, str):
        try:
            duration_minutes = int(duration_minutes) or DEFAULT_SLOT_MINUTES
        except (ValueError, TypeError):
            duration_minutes = DEFAULT_SLOT_MINUTES

    if not start_date:
        return {"success": False, "error": "start_date required"}

    range_data = _parse_datetime(start_date)
    if not range_data:
        return {"success": False, "error": "Invalid start_date"}

    if end_date:
        try:
            end_d = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            range_data["timeMax"] = end_d.isoformat()
        except (ValueError, TypeError):
            pass

    freebusy = service.freebusy().query(
        body={
            "timeMin": range_data["timeMin"],
            "timeMax": range_data["timeMax"],
            "items": [{"id": calendar_id}],
        }
    ).execute()

    cal = freebusy.get("calendars", {}).get(calendar_id, {})
    busy = cal.get("busy") or []
    free_slots = _get_free_slots(busy, range_data["timeMin"], range_data["timeMax"], duration_minutes)

    return {
        "success": True,
        "free_slots": free_slots,
        "busy_slots": [{"start": b.get("start"), "end": b.get("end")} for b in busy],
    }


def _handle_create_appointment(service, calendar_id: str, params: dict) -> dict:
    start_time = params.get("start_time")
    duration_minutes = params.get("duration_minutes") or DEFAULT_SLOT_MINUTES
    summary = params.get("summary") or "Appointment"
    description = params.get("description")
    attendees = params.get("attendees")

    if isinstance(duration_minutes, str):
        try:
            duration_minutes = int(duration_minutes) or DEFAULT_SLOT_MINUTES
        except (ValueError, TypeError):
            duration_minutes = DEFAULT_SLOT_MINUTES

    if not start_time:
        return {"success": False, "error": "start_time required"}

    try:
        start_d = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        end_d = start_d + timedelta(minutes=duration_minutes)
    except (ValueError, TypeError):
        return {"success": False, "error": "Invalid start_time"}

    # Check busy before insert
    freebusy_res = service.freebusy().query(
        body={
            "timeMin": start_d.isoformat(),
            "timeMax": end_d.isoformat(),
            "items": [{"id": calendar_id}],
        }
    ).execute()
    busy = freebusy_res.get("calendars", {}).get(calendar_id, {}).get("busy") or []

    if busy:
        day_start = start_d.replace(hour=0, minute=0, second=0, microsecond=0)
        from datetime import timedelta
        day_end = day_start + timedelta(days=1)
        day_fb = service.freebusy().query(
            body={
                "timeMin": day_start.isoformat(),
                "timeMax": day_end.isoformat(),
                "items": [{"id": calendar_id}],
            }
        ).execute()
        day_busy = day_fb.get("calendars", {}).get(calendar_id, {}).get("busy") or []
        suggested = _get_free_slots(
            day_busy,
            day_start.isoformat(),
            day_end.isoformat(),
            duration_minutes,
        )[:5]
        return {
            "success": False,
            "error": "slot_unavailable",
            "message": "That time slot is no longer available.",
            "suggested_slots": suggested,
        }

    event_body = {
        "summary": summary,
        "start": {"dateTime": start_d.isoformat(), "timeZone": DEFAULT_TIMEZONE},
        "end": {"dateTime": end_d.isoformat(), "timeZone": DEFAULT_TIMEZONE},
    }
    if description:
        event_body["description"] = description
    if attendees and isinstance(attendees, list):
        event_body["attendees"] = [{"email": e} for e in attendees if isinstance(e, str)]

    event = service.events().insert(
        calendarId=calendar_id,
        body=event_body,
        sendUpdates="none",
    ).execute()

    return {
        "success": True,
        "event_id": event.get("id"),
        "html_link": event.get("htmlLink"),
        "start": event.get("start", {}).get("dateTime") or event.get("start", {}).get("date"),
        "end": event.get("end", {}).get("dateTime") or event.get("end", {}).get("date"),
        "summary": event.get("summary"),
    }


def _handle_reschedule(service, calendar_id: str, params: dict) -> dict:
    event_id = params.get("event_id")
    new_start = params.get("new_start")
    duration_minutes = params.get("duration_minutes") or DEFAULT_SLOT_MINUTES
    if isinstance(duration_minutes, str):
        try:
            duration_minutes = int(duration_minutes) or DEFAULT_SLOT_MINUTES
        except (ValueError, TypeError):
            duration_minutes = DEFAULT_SLOT_MINUTES

    if not event_id or not new_start:
        return {"success": False, "error": "event_id and new_start required"}

    try:
        start_d = datetime.fromisoformat(new_start.replace("Z", "+00:00"))
        from datetime import timedelta
        end_d = start_d + timedelta(minutes=duration_minutes)
    except (ValueError, TypeError):
        return {"success": False, "error": "Invalid new_start"}

    try:
        event = service.events().patch(
            calendarId=calendar_id,
            eventId=event_id,
            body={
                "start": {"dateTime": start_d.isoformat(), "timeZone": DEFAULT_TIMEZONE},
                "end": {"dateTime": end_d.isoformat(), "timeZone": DEFAULT_TIMEZONE},
            },
            sendUpdates="none",
        ).execute()
        return {
            "success": True,
            "event_id": event.get("id"),
            "start": event.get("start", {}).get("dateTime") or event.get("start", {}).get("date"),
            "end": event.get("end", {}).get("dateTime") or event.get("end", {}).get("date"),
            "summary": event.get("summary"),
        }
    except Exception as e:
        msg = str(e)
        if "Conflict" in msg or "409" in msg or "not found" in msg.lower():
            range_data = _parse_datetime(new_start)
            if range_data:
                freebusy_res = service.freebusy().query(
                    body={
                        "timeMin": range_data["timeMin"],
                        "timeMax": range_data["timeMax"],
                        "items": [{"id": calendar_id}],
                    }
                ).execute()
                busy = freebusy_res.get("calendars", {}).get(calendar_id, {}).get("busy") or []
                suggested = _get_free_slots(
                    busy,
                    range_data["timeMin"],
                    range_data["timeMax"],
                    duration_minutes,
                )[:5]
                return {
                    "success": False,
                    "error": "slot_unavailable",
                    "message": "That time slot is not available.",
                    "suggested_slots": suggested,
                }
            return {
                "success": False,
                "error": "slot_unavailable",
                "message": "That time slot is not available.",
                "suggested_slots": [],
            }
        raise
