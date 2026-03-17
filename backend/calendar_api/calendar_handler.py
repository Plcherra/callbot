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
from utils.natural_datetime import parse_natural_datetime

logger = logging.getLogger(__name__)

DEFAULT_SLOT_MINUTES = 30
# Default for broad availability queries (e.g. "tomorrow morning") when duration not specified.
DEFAULT_AVAILABILITY_SLOT_MINUTES = 60
DEFAULT_TIMEZONE = "America/New_York"

# Business-day and period windows for range queries
BUSINESS_DAY_START_HOUR = 9
BUSINESS_DAY_END_HOUR = 17
SUGGESTED_SLOTS_MAX = 4


def _parse_datetime_range(date_str: str, timezone: str = DEFAULT_TIMEZONE) -> tuple[dict[str, str] | None, str]:
    """
    Parse either an ISO datetime/date or a natural language date into a timeMin/timeMax range.

    - If the input includes an explicit time (or is ISO datetime), use a 24h window from that moment.
    - If the input is date-only or natural language without explicit time, use the whole local day.
    """
    raw = (date_str or "").strip()
    if not raw:
        return None, "invalid"

    # First, try ISO.
    try:
        d = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        time_min = d.isoformat()
        time_max = (d + timedelta(days=1)).isoformat()
        mode = "exact_time_window" if ("T" in raw or ":" in raw or " " in raw) else "full_day"
        return {"timeMin": time_min, "timeMax": time_max}, mode
    except (ValueError, TypeError):
        pass

    parsed = parse_natural_datetime(raw, timezone=timezone)
    if not parsed:
        return None, "invalid"

    d = parsed.dt
    t = raw.lower()
    period = None
    if "morning" in t:
        period = "morning"
        day_start = d.replace(hour=9, minute=0, second=0, microsecond=0)
        day_end = d.replace(hour=12, minute=0, second=0, microsecond=0)
    elif "afternoon" in t:
        period = "afternoon"
        day_start = d.replace(hour=12, minute=0, second=0, microsecond=0)
        day_end = d.replace(hour=17, minute=0, second=0, microsecond=0)
    elif "evening" in t:
        period = "evening"
        day_start = d.replace(hour=17, minute=0, second=0, microsecond=0)
        day_end = d.replace(hour=20, minute=0, second=0, microsecond=0)
    else:
        period = None

    if period:
        mode = f"range_{period}"
        return {"timeMin": day_start.isoformat(), "timeMax": day_end.isoformat()}, mode

    if parsed.is_time_explicit:
        time_min = d.isoformat()
        time_max = (d + timedelta(days=1)).isoformat()
        return {"timeMin": time_min, "timeMax": time_max}, "exact_time_window"

    # Full day: business hours 09:00-17:00 for bookable slot suggestions.
    day_start = d.replace(hour=BUSINESS_DAY_START_HOUR, minute=0, second=0, microsecond=0)
    day_end = d.replace(hour=BUSINESS_DAY_END_HOUR, minute=0, second=0, microsecond=0)
    return {"timeMin": day_start.isoformat(), "timeMax": day_end.isoformat()}, "full_day"


def _parse_iso_datetime_or_natural(date_str: str, timezone: str = DEFAULT_TIMEZONE) -> datetime | None:
    """Parse ISO datetime or natural language datetime into an aware datetime."""
    raw = (date_str or "").strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        parsed = parse_natural_datetime(raw, timezone=timezone)
        return parsed.dt if parsed else None


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
    rec_res = supabase.table("receptionists").select("id, user_id, calendar_id, status, active").eq("id", receptionist_id).execute()
    if not rec_res.data or len(rec_res.data) == 0:
        raise HTTPException(status_code=404, detail="Receptionist not found")
    rec = rec_res.data[0]
    if rec.get("status") != "active" or rec.get("active") is False:
        raise HTTPException(status_code=404, detail="Receptionist not found or inactive")
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
            return _handle_create_appointment(service, calendar_id, params, receptionist_id, supabase)
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
    timezone = (params.get("timezone") or DEFAULT_TIMEZONE).strip() or DEFAULT_TIMEZONE
    date_text = params.get("date_text")
    start_date = params.get("start_date") or date_text
    end_date = params.get("end_date")

    if not start_date:
        return {"success": False, "error": "date_missing", "message": "Please provide a date and time (e.g. 'tomorrow at 4')."}

    range_data, parse_mode = _parse_datetime_range(start_date, timezone=timezone)
    if not range_data:
        return {"success": False, "error": "date_parse_failed", "message": "I couldn't understand the date/time. Could you rephrase it (e.g. 'March 17 at 7pm')?"}

    # Duration: for range-based queries default to 60 min for spoken availability; otherwise 30.
    range_modes = ("full_day", "range_morning", "range_afternoon", "range_evening")
    if parse_mode in range_modes:
        raw_dur = params.get("duration_minutes")
        if raw_dur is None or raw_dur == "":
            duration_minutes = DEFAULT_AVAILABILITY_SLOT_MINUTES
        else:
            try:
                duration_minutes = int(raw_dur) if isinstance(raw_dur, str) else raw_dur
                duration_minutes = duration_minutes or DEFAULT_AVAILABILITY_SLOT_MINUTES
            except (ValueError, TypeError):
                duration_minutes = DEFAULT_AVAILABILITY_SLOT_MINUTES
    else:
        duration_minutes = params.get("duration_minutes") or DEFAULT_SLOT_MINUTES
        if isinstance(duration_minutes, str):
            try:
                duration_minutes = int(duration_minutes) or DEFAULT_SLOT_MINUTES
            except (ValueError, TypeError):
                duration_minutes = DEFAULT_SLOT_MINUTES

    logger.info(
        "[CAL_DATE] check_availability input=%r timezone=%s mode=%s timeMin=%s timeMax=%s",
        start_date,
        timezone,
        parse_mode,
        range_data["timeMin"],
        range_data["timeMax"],
    )

    if end_date:
        try:
            end_d = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            range_data["timeMax"] = end_d.isoformat()
        except (ValueError, TypeError):
            pass

    logger.info(
        "[CALENDAR_CTX] availability_check calendar_id=%s timezone=%s timeMin=%s timeMax=%s",
        calendar_id,
        timezone,
        range_data["timeMin"],
        range_data["timeMax"],
    )

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

    requested_slot_start = None
    requested_slot_end = None
    slot_available = None
    available_slots: list[str] = []
    suggested_slots: list[str] = []
    requested_range_start: str | None = None
    requested_range_end: str | None = None

    if parse_mode in range_modes:
        requested_range_start = range_data["timeMin"]
        requested_range_end = range_data["timeMax"]
        available_slots = free_slots
        suggested_slots = free_slots[:SUGGESTED_SLOTS_MAX]
        logger.info(
            "[CAL_DATE] range_slot_generation mode=%s range_start=%s range_end=%s duration_minutes=%s candidate_slots=%d returned_slots=%d",
            parse_mode,
            requested_range_start,
            requested_range_end,
            duration_minutes,
            len(free_slots),
            len(suggested_slots),
        )

    # For exact time requests (e.g. "tomorrow at 7pm"), check only that specific slot.
    if parse_mode == "exact_time_window":
        slot_start = _parse_iso_datetime_or_natural(start_date, timezone=timezone)
        if slot_start:
            slot_end = slot_start + timedelta(minutes=duration_minutes)
            logger.info(
                "[CALENDAR_CTX] availability_slot_check calendar_id=%s slot_start=%s slot_end=%s",
                calendar_id,
                slot_start.isoformat(),
                slot_end.isoformat(),
            )
            slot_fb = service.freebusy().query(
                body={
                    "timeMin": slot_start.isoformat(),
                    "timeMax": slot_end.isoformat(),
                    "items": [{"id": calendar_id}],
                }
            ).execute()
            slot_cal = slot_fb.get("calendars", {}).get(calendar_id, {})
            slot_busy = slot_cal.get("busy") or []
            slot_available = len(slot_busy) == 0
            requested_slot_start = slot_start.isoformat()
            requested_slot_end = slot_end.isoformat()
            logger.info(
                "[CAL_DATE] check_availability_slot mode=exact_time_slot slot_start=%s slot_end=%s busy_count=%d",
                requested_slot_start,
                requested_slot_end,
                len(slot_busy),
            )

    return {
        "success": True,
        "free_slots": free_slots,
        "available_slots": available_slots,
        "suggested_slots": suggested_slots,
        "requested_range_start": requested_range_start,
        "requested_range_end": requested_range_end,
        "slot_duration_minutes": duration_minutes,
        "busy_slots": [{"start": b.get("start"), "end": b.get("end")} for b in busy],
        "requested_slot_start": requested_slot_start,
        "requested_slot_end": requested_slot_end,
        "slot_available": slot_available,
    }


def _handle_create_appointment(service, calendar_id: str, params: dict, receptionist_id: str, supabase) -> dict:
    timezone = (params.get("timezone") or DEFAULT_TIMEZONE).strip() or DEFAULT_TIMEZONE
    start_time = params.get("start_time") or params.get("date_text")
    duration_minutes = params.get("duration_minutes") or DEFAULT_SLOT_MINUTES
    summary = params.get("summary") or "Appointment"
    description = params.get("description")
    attendees = params.get("attendees")
    # Optional appointment / booking fields (provider-ready)
    location_type = (params.get("location_type") or "").strip() or None
    location_text = (params.get("location_text") or "").strip() or None
    customer_address = (params.get("customer_address") or "").strip() or None
    service_id = params.get("service_id")
    service_name = (params.get("service_name") or "").strip() or None
    notes = (params.get("notes") or "").strip() or None
    price_cents = params.get("price_cents")

    if isinstance(duration_minutes, str):
        try:
            duration_minutes = int(duration_minutes) or DEFAULT_SLOT_MINUTES
        except (ValueError, TypeError):
            duration_minutes = DEFAULT_SLOT_MINUTES
    if service_id is not None and isinstance(service_id, str) and not service_id.strip():
        service_id = None
    if price_cents is not None:
        try:
            price_cents = int(price_cents)
        except (TypeError, ValueError):
            price_cents = None

    if not start_time:
        return {"success": False, "error": "date_missing", "message": "What day and time should I book it for?"}

    try:
        start_d = _parse_iso_datetime_or_natural(start_time, timezone=timezone)
        if not start_d:
            return {"success": False, "error": "date_parse_failed", "message": "I couldn't understand the date/time. What day and time works for you?"}
        end_d = start_d + timedelta(minutes=duration_minutes)
    except (ValueError, TypeError):
        return {"success": False, "error": "date_parse_failed", "message": "I couldn't understand the date/time. What day and time works for you?"}

    start_iso = start_d.isoformat()
    end_iso = end_d.isoformat()
    logger.info(
        "[CAL_BOOK] create_appointment calendar_id=%s start=%s end=%s duration_minutes=%s",
        calendar_id,
        start_iso,
        end_iso,
        duration_minutes,
    )

    # Build description: optional location line for calendar event
    desc_parts = []
    if description:
        desc_parts.append(description)
    location_display = customer_address or location_text
    if location_display and location_type:
        desc_parts.append(f"Location ({location_type}): {location_display}")
    elif location_display:
        desc_parts.append(f"Location: {location_display}")
    if notes:
        desc_parts.append(f"Notes: {notes}")
    event_description = "\n\n".join(desc_parts) if desc_parts else None

    # Check busy before insert
    freebusy_res = service.freebusy().query(
        body={
            "timeMin": start_iso,
            "timeMax": end_iso,
            "items": [{"id": calendar_id}],
        }
    ).execute()
    busy = freebusy_res.get("calendars", {}).get(calendar_id, {}).get("busy") or []

    if busy:
        day_start = start_d.replace(hour=0, minute=0, second=0, microsecond=0)
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
        "start": {"dateTime": start_iso, "timeZone": timezone},
        "end": {"dateTime": end_iso, "timeZone": timezone},
    }
    if event_description:
        event_body["description"] = event_description
    if attendees and isinstance(attendees, list):
        event_body["attendees"] = [{"email": e} for e in attendees if isinstance(e, str)]

    try:
        event = service.events().insert(
            calendarId=calendar_id,
            body=event_body,
            sendUpdates="none",
        ).execute()
    except Exception as e:
        msg = str(e)
        is_conflict = "Conflict" in msg or "409" in msg or "not found" in msg.lower() or "busy" in msg.lower()
        if is_conflict:
            day_start = start_d.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = day_start + timedelta(days=1)
            try:
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
            except Exception:
                suggested = []
            logger.info(
                "[CAL_BOOK] create_appointment error type=slot_unavailable message=%s",
                msg[:200],
            )
            return {
                "success": False,
                "error": "slot_unavailable",
                "message": "That time slot is no longer available.",
                "suggested_slots": suggested,
            }
        logger.warning(
            "[CAL_BOOK] create_appointment error type=calendar_internal_error message=%s",
            msg[:200],
        )
        return {
            "success": False,
            "error": "calendar_internal_error",
            "message": "I had trouble creating the appointment, but the slot may still be available.",
        }

    logger.info("[CAL_BOOK] create_appointment success event_id=%s", event.get("id"))

    # Persist extended booking record (provider-ready for Square etc.)
    try:
        supabase.table("appointments").insert({
            "receptionist_id": receptionist_id,
            "event_id": event.get("id"),
            "start_time": start_iso,
            "end_time": end_iso,
            "duration_minutes": duration_minutes,
            "summary": summary,
            "description": event_description,
            "service_id": service_id,
            "service_name": service_name,
            "location_type": location_type,
            "location_text": location_text,
            "customer_address": customer_address,
            "price_cents": price_cents,
            "notes": notes,
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }).execute()
    except Exception as ex:
        logger.warning("[CAL_BOOK] appointments insert failed (event already created): %s", ex)

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
    timezone = (params.get("timezone") or DEFAULT_TIMEZONE).strip() or DEFAULT_TIMEZONE
    new_start = params.get("new_start") or params.get("date_text")
    duration_minutes = params.get("duration_minutes") or DEFAULT_SLOT_MINUTES
    if isinstance(duration_minutes, str):
        try:
            duration_minutes = int(duration_minutes) or DEFAULT_SLOT_MINUTES
        except (ValueError, TypeError):
            duration_minutes = DEFAULT_SLOT_MINUTES

    if not event_id:
        return {"success": False, "error": "event_id_missing", "message": "Which appointment should I reschedule?"}
    if not new_start:
        return {"success": False, "error": "date_missing", "message": "What new day and time would you like?"}

    try:
        logger.info("[CAL_DATE] reschedule input=%r timezone=%s", new_start, timezone)
        start_d = _parse_iso_datetime_or_natural(new_start, timezone=timezone)
        if not start_d:
            return {"success": False, "error": "date_parse_failed", "message": "I couldn't understand the new date/time. What day and time should I move it to?"}
        end_d = start_d + timedelta(minutes=duration_minutes)
    except (ValueError, TypeError):
        return {"success": False, "error": "date_parse_failed", "message": "I couldn't understand the new date/time. What day and time should I move it to?"}

    try:
        event = service.events().patch(
            calendarId=calendar_id,
            eventId=event_id,
            body={
                "start": {"dateTime": start_d.isoformat(), "timeZone": timezone},
                "end": {"dateTime": end_d.isoformat(), "timeZone": timezone},
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
            range_data, parse_mode = _parse_datetime_range(new_start, timezone=timezone)
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
