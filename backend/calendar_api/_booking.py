from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta

from ._parsing import get_free_slots, parse_iso_datetime_or_natural
from telnyx import sms as telnyx_sms

logger = logging.getLogger(__name__)

_SERVICE_SELECT_FIELDS = (
    "id, name, duration_minutes, price_cents, requires_location, default_location_type, "
    "followup_mode, followup_message_template, payment_link, meeting_instructions, "
    "owner_selected_platform, internal_followup_notes"
)

_RECEPTIONIST_SELECT_FIELDS = "id, generic_followup_message_template"

_DEFAULT_GENERIC_UNDER_REVIEW_MESSAGE = (
    "Your appointment is under review and additional information will be provided soon."
)

_SMS_OPTOUT_SUFFIX = "Reply STOP to opt out."
_E164_RE = re.compile(r"^\+\d{10,15}$")


def _mask_phone(p: str | None) -> str:
    s = (p or "").strip()
    if not s:
        return "(empty)"
    # Keep country code + last 2 digits when possible
    digits = "".join(ch for ch in s if ch.isdigit())
    if len(digits) <= 4:
        return "***"
    return f"{digits[:2]}***{digits[-2:]}"


def _resolve_sms_from_number(*, supabase, receptionist_id: str) -> str | None:
    if not supabase or not receptionist_id:
        return None
    try:
        res = (
            supabase.table("receptionists")
            .select("id, telnyx_phone_number, inbound_phone_number")
            .eq("id", receptionist_id)
            .limit(1)
            .execute()
        )
        if res and getattr(res, "data", None):
            row = res.data[0] or {}
            from_num = (row.get("telnyx_phone_number") or "").strip() or None
            if from_num:
                return from_num
            from_num = (row.get("inbound_phone_number") or "").strip() or None
            return from_num
        return None
    except Exception:
        logger.exception("[CAL_BOOK] sms_from_number_resolve_failed receptionist_id=%s", receptionist_id)
        return None


def _normalize_service_name(s: str | None) -> str:
    """Normalize for matching: lowercase, trim, collapse spaces, remove simple punctuation."""
    if not s or not isinstance(s, str):
        return ""
    s = s.strip().lower()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[.,;:!?\-'\"()]", "", s)
    return s.strip()


def _normalize_phone(phone: str | None) -> str | None:
    """Normalize for E.164: trim, keep leading +, remove spaces/parens/dashes/dots."""
    if not phone or not isinstance(phone, str):
        return None
    s = phone.strip()
    if not s:
        return None
    keep_plus = s.startswith("+")
    digits = "".join(c for c in s if c.isdigit())
    if not digits:
        return None
    return ("+" if keep_plus else "") + digits


def _is_e164(phone: str | None) -> bool:
    s = (phone or "").strip()
    return bool(s and _E164_RE.match(s))


def _resolve_generic_followup_template(*, supabase, receptionist_id: str) -> str | None:
    if not supabase or not receptionist_id:
        return None
    try:
        res = (
            supabase.table("receptionists")
            .select(_RECEPTIONIST_SELECT_FIELDS)
            .eq("id", receptionist_id)
            .limit(1)
            .execute()
        )
        if res and getattr(res, "data", None):
            tmpl = (res.data[0].get("generic_followup_message_template") or "").strip()
            return tmpl or None
        return None
    except Exception:
        logger.exception(
            "[CAL_BOOK] generic_followup_template_resolve_failed receptionist_id=%s",
            receptionist_id,
        )
        return None


def _resolve_followup_for_booking(
    *,
    service_based: bool,
    resolved_service: dict | None,
    supabase,
    receptionist_id: str,
) -> dict:
    """
    Returns resolved follow-up fields to persist and return to caller:
    - booking_mode, followup_mode, followup_message_resolved, payment_link,
      meeting_instructions, owner_selected_platform, internal_followup_notes
    """
    if service_based and isinstance(resolved_service, dict):
        booking_mode = "service_based"
        followup_mode = (resolved_service.get("followup_mode") or "").strip() or "under_review"
        template = (resolved_service.get("followup_message_template") or "").strip() or None
        payment_link = (resolved_service.get("payment_link") or "").strip() or None
        meeting_instructions = (resolved_service.get("meeting_instructions") or "").strip() or None
        owner_selected_platform = (resolved_service.get("owner_selected_platform") or "").strip() or None
        internal_followup_notes = (resolved_service.get("internal_followup_notes") or "").strip() or None

        if followup_mode == "send_custom_message":
            msg = template
        elif followup_mode == "send_payment_link":
            msg = template or "We’ll text you a payment link shortly to confirm your appointment."
        elif followup_mode == "under_review":
            msg = template or _DEFAULT_GENERIC_UNDER_REVIEW_MESSAGE
        else:
            # none or unknown -> treat as none
            followup_mode = "none"
            msg = None

        return {
            "booking_mode": booking_mode,
            "followup_mode": followup_mode,
            "followup_message_resolved": msg,
            "payment_link": payment_link,
            "meeting_instructions": meeting_instructions,
            "owner_selected_platform": owner_selected_platform,
            "internal_followup_notes": internal_followup_notes,
            "template_source": "service_template" if template else "service_default",
        }

    # Generic/no-service booking: always under review
    booking_mode = "generic"
    tmpl = _resolve_generic_followup_template(supabase=supabase, receptionist_id=receptionist_id)
    msg = tmpl or _DEFAULT_GENERIC_UNDER_REVIEW_MESSAGE
    return {
        "booking_mode": booking_mode,
        "followup_mode": "under_review",
        "followup_message_resolved": msg,
        "payment_link": None,
        "meeting_instructions": None,
        "owner_selected_platform": None,
        "internal_followup_notes": None,
        "template_source": "receptionist_generic" if tmpl else "backend_fallback",
    }


def _resolve_service_for_booking(
    *,
    supabase,
    receptionist_id: str,
    service_id,
    service_name: str | None,
) -> dict | None:
    if not supabase or not receptionist_id:
        return None
    if service_id is not None and not isinstance(service_id, str):
        service_id = str(service_id)
    service_id = (service_id or "").strip() or None
    service_name = (service_name or "").strip() or None
    if not service_id and not service_name:
        return None

    try:
        base = (
            supabase.table("services")
            .select(_SERVICE_SELECT_FIELDS)
            .eq("receptionist_id", receptionist_id)
        )
        if service_id:
            res = base.eq("id", service_id).limit(1).execute()
            if res and getattr(res, "data", None):
                return res.data[0]
            return None

        # Name-based resolution with normalization and safe matching order.
        incoming_raw = service_name
        incoming_norm = _normalize_service_name(service_name)
        if not incoming_norm:
            logger.info(
                "[CAL_BOOK] service_resolution incoming=%r normalized=%r match_mode=empty resolved_id=None resolved_name=None",
                incoming_raw,
                incoming_norm,
            )
            return None

        res = base.execute()
        all_services = (res.data or []) if res and getattr(res, "data", None) else []
        if not all_services:
            logger.info(
                "[CAL_BOOK] service_resolution incoming=%r normalized=%r match_mode=no_services resolved_id=None resolved_name=None",
                incoming_raw,
                incoming_norm,
            )
            return None

        # 1. Exact normalized match
        for svc in all_services:
            stored_name = (svc.get("name") or "").strip()
            stored_norm = _normalize_service_name(stored_name)
            if stored_norm == incoming_norm:
                logger.info(
                    "[CAL_BOOK] service_resolution incoming=%r normalized=%r match_mode=exact_normalized resolved_id=%s resolved_name=%r",
                    incoming_raw,
                    incoming_norm,
                    svc.get("id"),
                    stored_name,
                )
                return svc

        # 2. Case-insensitive exact (already covered by normalized; try direct ilike as fallback)
        for svc in all_services:
            stored_name = (svc.get("name") or "").strip()
            if stored_name and stored_name.lower() == incoming_norm:
                logger.info(
                    "[CAL_BOOK] service_resolution incoming=%r normalized=%r match_mode=exact_ci resolved_id=%s resolved_name=%r",
                    incoming_raw,
                    incoming_norm,
                    svc.get("id"),
                    stored_name,
                )
                return svc

        # 3. Contained-match only if unambiguous
        contained_matches = []
        for svc in all_services:
            stored_name = (svc.get("name") or "").strip()
            stored_norm = _normalize_service_name(stored_name)
            if not stored_norm:
                continue
            # Incoming contained in stored, or stored contained in incoming
            if incoming_norm in stored_norm or stored_norm in incoming_norm:
                contained_matches.append(svc)
        if len(contained_matches) == 1:
            svc = contained_matches[0]
            logger.info(
                "[CAL_BOOK] service_resolution incoming=%r normalized=%r match_mode=contained_unambiguous resolved_id=%s resolved_name=%r",
                incoming_raw,
                incoming_norm,
                svc.get("id"),
                (svc.get("name") or "").strip(),
            )
            return svc
        if len(contained_matches) > 1:
            logger.info(
                "[CAL_BOOK] service_resolution incoming=%r normalized=%r match_mode=contained_ambiguous count=%d resolved_id=None resolved_name=None",
                incoming_raw,
                incoming_norm,
                len(contained_matches),
            )
            return None

        logger.info(
            "[CAL_BOOK] service_resolution incoming=%r normalized=%r match_mode=no_match resolved_id=None resolved_name=None",
            incoming_raw,
            incoming_norm,
        )
        return None
    except Exception:
        logger.exception(
            "[CAL_BOOK] service_resolve_failed receptionist_id=%s service_id=%s service_name=%r",
            receptionist_id,
            service_id,
            service_name,
        )
        return None


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

    resolved_service = _resolve_service_for_booking(
        supabase=supabase,
        receptionist_id=receptionist_id,
        service_id=service_id,
        service_name=service_name,
    )

    # Service-based booking: if the selected service maps to a stored service with duration > 0,
    # the stored service configuration is authoritative.
    service_based = False
    if isinstance(resolved_service, dict):
        try:
            svc_dur = int(resolved_service.get("duration_minutes") or 0)
        except (TypeError, ValueError):
            svc_dur = 0
        if svc_dur > 0:
            service_based = True

    if service_based:
        # Authoritative duration.
        duration_minutes = int(resolved_service.get("duration_minutes") or duration_minutes)

        # Prefer stored service name/id when present (for persistence consistency).
        service_id = resolved_service.get("id") or service_id
        service_name = (resolved_service.get("name") or service_name or "").strip() or service_name

        # Prefer stored price when set (do not invent).
        svc_price = resolved_service.get("price_cents")
        if svc_price is not None:
            try:
                svc_price_i = int(svc_price)
            except (TypeError, ValueError):
                svc_price_i = None
            if svc_price_i is not None and svc_price_i > 0:
                price_cents = svc_price_i

        # Authoritative location_type when configured.
        svc_loc_type = (resolved_service.get("default_location_type") or "").strip() or None
        if svc_loc_type:
            location_type = svc_loc_type

        # Enforce required details only when service requires a location.
        requires_location = bool(resolved_service.get("requires_location"))
        if requires_location:
            if location_type == "customer_address" and not customer_address:
                return {
                    "success": False,
                    "error": "location_missing",
                    "message": "What address should I use for the appointment?",
                }
            if location_type == "custom" and not location_text:
                return {
                    "success": False,
                    "error": "location_missing",
                    "message": "What details should I include for the appointment location?",
                }

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
    followup = _resolve_followup_for_booking(
        service_based=service_based,
        resolved_service=resolved_service if isinstance(resolved_service, dict) else None,
        supabase=supabase,
        receptionist_id=receptionist_id,
    )
    logger.info(
        "[CAL_BOOK] followup_resolution booking_mode=%s followup_mode=%s has_template=%s has_payment_link=%s has_message=%s",
        followup.get("booking_mode"),
        followup.get("followup_mode"),
        bool((resolved_service or {}).get("followup_message_template")) if service_based else False,
        bool(followup.get("payment_link")),
        bool(followup.get("followup_message_resolved")),
    )
    logger.info(
        "[CAL_BOOK] service_resolution mode=%s selected_service_id=%s selected_service_name=%r resolved=%s resolved_duration_minutes=%s resolved_price_cents=%s resolved_location_type=%s",
        "service_based" if service_based else "generic",
        params.get("service_id"),
        (params.get("service_name") or "").strip() or None,
        bool(resolved_service),
        duration_minutes,
        price_cents,
        location_type,
    )
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
            "booking_mode": followup.get("booking_mode"),
            "followup_mode": followup.get("followup_mode"),
            "followup_message_resolved": followup.get("followup_message_resolved"),
            "payment_link": followup.get("payment_link"),
            "meeting_instructions": followup.get("meeting_instructions"),
            "owner_selected_platform": followup.get("owner_selected_platform"),
            "internal_followup_notes": followup.get("internal_followup_notes"),
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }).execute()
    except Exception as ex:
        logger.warning("[CAL_BOOK] appointments insert failed (event already created): %s", ex)

    # Immediate post-booking SMS follow-up (best-effort; never breaks booking).
    try:
        to_number_raw = (params.get("caller_phone") or "").strip() or None
        to_number = _normalize_phone(to_number_raw) if to_number_raw else None
        if to_number_raw and to_number != to_number_raw:
            logger.info(
                "[CAL_BOOK] sms_phone_normalization raw=%s normalized=%s",
                _mask_phone(to_number_raw),
                _mask_phone(to_number),
            )
        from_number = _resolve_sms_from_number(supabase=supabase, receptionist_id=receptionist_id)
        resolved_msg = (followup.get("followup_message_resolved") or "").strip() or None
        if to_number_raw and not to_number:
            logger.info(
                "[CAL_BOOK] sms_followup_skipped mode=%s template_source=%s reason=normalize_failed to=%s",
                followup.get("booking_mode"),
                followup.get("template_source"),
                _mask_phone(to_number_raw),
            )
        elif to_number and not _is_e164(to_number):
            logger.info(
                "[CAL_BOOK] sms_followup_skipped mode=%s template_source=%s reason=invalid_e164 to=%s",
                followup.get("booking_mode"),
                followup.get("template_source"),
                _mask_phone(to_number),
            )
        elif to_number and from_number and resolved_msg:
            sms_text = f"{resolved_msg}\n\n{_SMS_OPTOUT_SUFFIX}"
            sms_res = telnyx_sms.send_sms(to_number=to_number, from_number=from_number, text=sms_text)
            logger.info(
                "[CAL_BOOK] sms_followup mode=%s template_source=%s to=%s from=%s success=%s telnyx_message_id=%s error=%s",
                followup.get("booking_mode"),
                followup.get("template_source"),
                _mask_phone(to_number),
                _mask_phone(from_number),
                bool(sms_res.get("success")),
                (sms_res.get("telnyx_message_id") or "")[:40],
                (sms_res.get("error") or "")[:120],
            )
        else:
            logger.info(
                "[CAL_BOOK] sms_followup_skipped mode=%s template_source=%s to_present=%s from_present=%s msg_present=%s",
                followup.get("booking_mode"),
                followup.get("template_source"),
                bool(to_number),
                bool(from_number),
                bool(resolved_msg),
            )
    except Exception as ex:
        logger.warning("[CAL_BOOK] sms_followup_failed (booking kept): %s", ex)

    return {
        "success": True,
        "event_id": event.get("id"),
        "html_link": event.get("htmlLink"),
        "start": event.get("start", {}).get("dateTime") or event.get("start", {}).get("date"),
        "end": event.get("end", {}).get("dateTime") or event.get("end", {}).get("date"),
        "summary": event.get("summary"),
        "followup_mode": followup.get("followup_mode"),
        "followup_message_resolved": followup.get("followup_message_resolved"),
        "payment_link": followup.get("payment_link"),
        "meeting_instructions": followup.get("meeting_instructions"),
        "owner_selected_platform": followup.get("owner_selected_platform"),
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

