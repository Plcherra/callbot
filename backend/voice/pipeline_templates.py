"""Deterministic spoken responses from tool results, SMS truth lines, availability guard logging."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import Any, Optional

from telnyx.sms_delivery_registry import get_delivery_status
from voice.pipeline_transcript import is_post_booking_followup_message

logger = logging.getLogger(__name__)


def _extract_spoken_slots(text: str) -> list[str]:
    """Best-effort extraction of time-like mentions from spoken response for guard logging."""
    if not text or not text.strip():
        return []
    t = text.lower()
    found: list[str] = []
    for m in re.finditer(r"\b(\d{1,2})\s*(?::\d{2})?\s*(am|pm|a\.m\.|p\.m\.|o'?clock)?\b", t, re.IGNORECASE):
        found.append(m.group(0).strip())
    for period in ("morning", "afternoon", "evening"):
        if period in t:
            found.append(period)
    return found


def log_availability_guard(response: str, tool_slots: dict[str, Any]) -> None:
    """Log tool slots vs spoken slots; warn if response mentions times not in tool result."""
    tool_exact = tool_slots.get("exact_slots") or []
    tool_suggested = tool_slots.get("suggested_slots") or []
    tool_periods = tool_slots.get("summary_periods") or []
    slots_str = ",".join(tool_exact or tool_suggested)
    logger.info("[AVAILABILITY_SPOKEN_GUARD] tool_slots=%s", slots_str or "(none)")
    spoken = _extract_spoken_slots(response)
    logger.info("[AVAILABILITY_SPOKEN_GUARD] spoken_slots=%s", ",".join(spoken) if spoken else "(none)")
    if not spoken:
        return
    allowed = set(str(s) for s in (tool_exact or tool_suggested))
    allowed_periods = set(p.lower() for p in tool_periods)
    for s in spoken:
        s_lower = s.lower()
        if s_lower in allowed_periods:
            continue
        if any(s_lower in a or a in s_lower for a in allowed):
            continue
        if re.match(r"^\d", s) and not allowed:
            logger.warning(
                "[AVAILABILITY_SPOKEN_GUARD] spoken time %r may not be in tool result tool_slots=%s",
                s,
                slots_str,
            )
        elif re.match(r"^\d", s):
            logger.warning(
                "[AVAILABILITY_SPOKEN_GUARD] spoken time %r differs from tool slots=%s",
                s,
                slots_str,
            )


def to_spoken_slot(slot: str) -> str:
    try:
        dt = datetime.fromisoformat(slot.replace("Z", "+00:00"))
        return dt.strftime("%-I:%M %p").lower()
    except Exception:
        return slot


def slots_sentence(slots: list[str]) -> str:
    spoken = [to_spoken_slot(s) for s in slots[:3]]
    if not spoken:
        return ""
    if len(spoken) == 1:
        return spoken[0]
    if len(spoken) == 2:
        return f"{spoken[0]} or {spoken[1]}"
    return f"{spoken[0]}, {spoken[1]}, or {spoken[2]}"


def _openings_line_from_summary_periods(periods: list[str]) -> str:
    """Spoken bucket summary (morning / afternoon / evening) from tool `summary_periods`."""
    order = ("morning", "afternoon", "evening")
    seen = {p.lower() for p in periods if isinstance(p, str)}
    ordered = [p for p in order if p in seen]
    if not ordered:
        return "I have some openings"
    if len(ordered) == 1:
        return f"I have {ordered[0]} openings"
    if len(ordered) == 2:
        return f"I have {ordered[0]} and {ordered[1]} openings"
    return f"I have {ordered[0]}, {ordered[1]}, and {ordered[2]} openings"


def truth_aware_sms_line(voice_session: dict[str, Any] | None) -> str:
    """One short line about confirmation text; never claim delivered if API failed or delivery failed."""
    vs = voice_session or {}
    sms = vs.get("sms") if isinstance(vs.get("sms"), dict) else {}
    if not sms.get("attempted"):
        return ""
    if not sms.get("api_accepted"):
        return " I wasn't able to send a confirmation text—please save this time or call back if anything changes."
    msg_id = (sms.get("telnyx_message_id") or "").strip()
    delivery = get_delivery_status(msg_id) if msg_id else None
    if delivery == "delivery_failed":
        if sms.get("from_number_is_toll_free"):
            return (
                " A confirmation text didn't go through—if you're expecting SMS, toll-free numbers often need "
                "verification with your carrier provider first."
            )
        return " A confirmation text didn't go through—please save this time or call us if you need to change it."
    if delivery in ("delivered",):
        return " You should get a confirmation text shortly."
    return " I've sent a confirmation text—if it doesn't show up, you can call back anytime."


def template_from_tool_result(
    tool_name: str,
    result_json: str,
    requested_date: Optional[str],
    requested_time: Optional[str],
    *,
    voice_session: Optional[dict[str, Any]] = None,
) -> Optional[str]:
    try:
        parsed = json.loads(result_json or "{}")
    except Exception:
        return None
    if parsed.get("success") is not True:
        if tool_name == "check_availability":
            return "I couldn't fetch availability just now. Want me to try a different day?"
        if tool_name == "create_appointment":
            return "I couldn't complete that booking yet. Could you repeat the date and time?"
        return None

    if tool_name == "check_availability":
        slots = parsed.get("exact_slots") or parsed.get("suggested_slots") or []
        if slots:
            day_text = requested_date or "that day"
            periods = parsed.get("summary_periods") if isinstance(parsed.get("summary_periods"), list) else []
            if periods:
                bucket = _openings_line_from_summary_periods(periods)
                times = slots_sentence(slots)
                return f"I checked {day_text}—{bucket}. Specific times that work are {times}. Which do you prefer?"
            return f"I found {slots_sentence(slots)} for {day_text}. Which works best?"
        return "I don't have open slots in that window. Want me to check another day?"

    if tool_name == "create_appointment":
        start = (parsed.get("start_time") or "").strip()
        sms_line = truth_aware_sms_line(voice_session)
        if start:
            base = f"You're all set for {to_spoken_slot(start)}."
            return base + sms_line if sms_line else base
        if requested_time:
            date_part = requested_date or "that day"
            base = f"You're all set for {requested_time} {date_part}."
            return base + sms_line if sms_line else base
        base = "You're all set."
        return base + sms_line if sms_line else base
    return None


def deterministic_post_booking_reply(user_text: str, voice_session: dict[str, Any]) -> Optional[str]:
    """One short truth-aware reply for common post-booking questions; no chains."""
    if not voice_session.get("booking_completed"):
        return None
    if not is_post_booking_followup_message(user_text):
        return None
    sms_line = truth_aware_sms_line(voice_session).strip()
    if sms_line:
        return f"You're all set.{sms_line}"
    return "You're all set. If anything changes, just call us back."
