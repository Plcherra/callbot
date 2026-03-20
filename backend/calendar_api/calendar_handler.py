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
from calendar_api._availability import handle_check_availability
from calendar_api._booking import handle_create_appointment, handle_reschedule
from calendar_api._parsing import parse_datetime_range

logger = logging.getLogger(__name__)

DEFAULT_SLOT_MINUTES = 30
# Default for broad availability queries (e.g. "tomorrow morning") when duration not specified.
DEFAULT_AVAILABILITY_SLOT_MINUTES = 60
DEFAULT_TIMEZONE = "America/New_York"

# Business-day and period windows for range queries
BUSINESS_DAY_START_HOUR = 9
BUSINESS_DAY_END_HOUR = 17
SUGGESTED_SLOTS_MAX = 3


def _parse_datetime_range(date_str: str, timezone: str = DEFAULT_TIMEZONE) -> tuple[dict[str, str] | None, str]:
    return parse_datetime_range(
        date_str,
        timezone=timezone,
        business_day_start_hour=BUSINESS_DAY_START_HOUR,
        business_day_end_hour=BUSINESS_DAY_END_HOUR,
    )


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
            guard_err = _check_service_first_guard(supabase, receptionist_id, params)
            if guard_err:
                return guard_err
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


def _check_service_first_guard(supabase, receptionist_id: str, params: dict) -> dict | None:
    """If services exist and caller has not selected service or confirmed generic, return error dict; else None."""
    svc_res = supabase.table("services").select("id").eq("receptionist_id", receptionist_id).execute()
    services_count = len(svc_res.data or [])
    has_service = bool(
        (params.get("service_id") or "").strip() or (params.get("service_name") or "").strip()
    )
    generic_confirmed = params.get("generic_appointment_requested") is True
    if services_count > 0 and not has_service and not generic_confirmed:
        logger.info(
            "[CAL_BOOK] service_first_guard services_count=%d has_service=%s generic_confirmed=%s action=blocked",
            services_count,
            has_service,
            generic_confirmed,
        )
        return {
            "success": False,
            "error": "service_selection_required",
            "message": "Sure — what would you like to book? Are you looking for one of our services, or a general appointment?",
        }
    logger.info(
        "[CAL_BOOK] service_first_guard services_count=%d has_service=%s generic_confirmed=%s action=proceed",
        services_count,
        has_service,
        generic_confirmed,
    )
    return None


def _handle_check_availability(service, calendar_id: str, params: dict) -> dict:
    return handle_check_availability(
        service,
        calendar_id,
        params,
        default_timezone=DEFAULT_TIMEZONE,
        default_slot_minutes=DEFAULT_SLOT_MINUTES,
        default_availability_slot_minutes=DEFAULT_AVAILABILITY_SLOT_MINUTES,
        business_day_start_hour=BUSINESS_DAY_START_HOUR,
        business_day_end_hour=BUSINESS_DAY_END_HOUR,
        suggested_slots_max=SUGGESTED_SLOTS_MAX,
    )


def _handle_create_appointment(service, calendar_id: str, params: dict, receptionist_id: str, supabase) -> dict:
    return handle_create_appointment(
        service,
        calendar_id,
        params,
        receptionist_id=receptionist_id,
        supabase=supabase,
        default_timezone=DEFAULT_TIMEZONE,
        default_slot_minutes=DEFAULT_SLOT_MINUTES,
    )


def _handle_reschedule(service, calendar_id: str, params: dict) -> dict:
    return handle_reschedule(
        service,
        calendar_id,
        params,
        default_timezone=DEFAULT_TIMEZONE,
        default_slot_minutes=DEFAULT_SLOT_MINUTES,
        parse_datetime_range_fn=_parse_datetime_range,
    )
