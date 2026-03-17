from __future__ import annotations

import logging
from datetime import datetime, timedelta

from ._parsing import get_free_slots, parse_iso_datetime_or_natural

logger = logging.getLogger(__name__)


def handle_create_appointment(
    service,
    calendar_id: str,
    params: dict,
    *,
    receptionist_id: str,
    supabase,
    default_timezone: str,
    default_slot_minutes: int,
) -> dict:
    timezone = (params.get("timezone") or default_timezone).strip() or default_timezone
    start_time = params.get("start_time") or params.get("date_text")
    duration_minutes = params.get("duration_minutes") or default_slot_minutes
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
            duration_minutes = int(duration_minutes) or default_slot_minutes
        except (ValueError, TypeError):
            duration_minutes = default_slot_minutes
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
        start_d = parse_iso_datetime_or_natural(start_time, timezone=timezone)
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
        suggested = get_free_slots(
            busy=day_busy,
            time_min=day_start.isoformat(),
            time_max=day_end.isoformat(),
            slot_minutes=duration_minutes,
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
                suggested = get_free_slots(
                    busy=day_busy,
                    time_min=day_start.isoformat(),
                    time_max=day_end.isoformat(),
                    slot_minutes=duration_minutes,
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


def handle_reschedule(
    service,
    calendar_id: str,
    params: dict,
    *,
    default_timezone: str,
    default_slot_minutes: int,
    parse_datetime_range_fn,
) -> dict:
    event_id = params.get("event_id")
    timezone = (params.get("timezone") or default_timezone).strip() or default_timezone
    new_start = params.get("new_start") or params.get("date_text")
    duration_minutes = params.get("duration_minutes") or default_slot_minutes
    if isinstance(duration_minutes, str):
        try:
            duration_minutes = int(duration_minutes) or default_slot_minutes
        except (ValueError, TypeError):
            duration_minutes = default_slot_minutes

    if not event_id:
        return {"success": False, "error": "event_id_missing", "message": "Which appointment should I reschedule?"}
    if not new_start:
        return {"success": False, "error": "date_missing", "message": "What new day and time would you like?"}

    try:
        logger.info("[CAL_DATE] reschedule input=%r timezone=%s", new_start, timezone)
        start_d = parse_iso_datetime_or_natural(new_start, timezone=timezone)
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
            range_data, _parse_mode = parse_datetime_range_fn(new_start, timezone=timezone)
            if range_data:
                freebusy_res = service.freebusy().query(
                    body={
                        "timeMin": range_data["timeMin"],
                        "timeMax": range_data["timeMax"],
                        "items": [{"id": calendar_id}],
                    }
                ).execute()
                busy = freebusy_res.get("calendars", {}).get(calendar_id, {}).get("busy") or []
                suggested = get_free_slots(
                    busy=busy,
                    time_min=range_data["timeMin"],
                    time_max=range_data["timeMax"],
                    slot_minutes=duration_minutes,
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

