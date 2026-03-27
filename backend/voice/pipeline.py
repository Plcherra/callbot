"""Voice pipeline: Deepgram STT -> Grok LLM -> TTS (Google Cloud)."""

import asyncio
import json
import logging
import re
import time
from collections import deque
from datetime import datetime
from typing import Any, Callable, Awaitable, Optional

from config import settings
from telnyx.sms_delivery_registry import get_delivery_status
from voice.deepgram_client import create_deepgram_live
from voice.grok_client import chat, chat_with_tools
from voice.slot_selection import is_new_availability_search_intent, resolve_slot_selection
from voice.tts_facade import generate_and_send_tts
from voice.calendar_tools import CALENDAR_TOOLS, call_calendar_tool

logger = logging.getLogger(__name__)

MAX_HISTORY = 20
FILLER_WORDS = frozenset({"um", "uh", "hmm", "eh", "er", "ah", "like", "well", "so"})
DEBOUNCE_MS = 1200
DEBOUNCE_MS_FALLBACK = 800
SHORT_PAUSE_MAX_WORDS = 4
MIN_CONFIDENCE = 0.35

# Short utterances that should trigger processing immediately (normal debounce, no extended wait).
# Normalized for matching: lowercase, strip punctuation, collapse spaces (e.g. "9 am" -> "9am").
SHORT_UTTERANCE_WHITELIST = frozenset({
    "hello", "hi", "hey", "yes", "yeah", "yup", "no", "okay", "ok",
    "book", "booking", "pricing", "price", "tomorrow", "today",
    "9am", "9 am", "10am", "10 am", "11am", "11 am", "8am", "8 am",
    "can you hear me", "you there", "anybody there",
})

# Phrases that indicate the caller likely has more to say (incomplete turn)
INCOMPLETE_PHRASE_ENDINGS = (
    " to",
    " for",
    " at",
    " on",
    " i want",
    " i wanna",
    " i need",
    " can you",
    " could you",
    " tomorrow at",
    " today at",
)
INCOMPLETE_SINGLE_WORDS = frozenset({"to", "for", "at", "on"})
INTENT_HINTS = (
    "book",
    "appointment",
    "availability",
    "available",
    "spot",
    "tomorrow",
    "today",
    "reschedule",
    "cancel",
    "price",
    "pricing",
)


def _normalize_for_whitelist(text: str) -> str:
    """Normalize transcript for whitelist matching: lowercase, strip punctuation, collapse spaces."""
    if not text:
        return ""
    s = (text or "").strip().lower()
    s = re.sub(r"[?!.,;:]+", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s
CALENDAR_TOOL_NAMES = ("check_availability", "create_appointment", "reschedule_appointment")
PRE_TOOL_FILLER_PHRASE = "One sec."
FAST_ACK_AVAILABILITY = "Checking now."
FAST_ACK_BOOKING = "Got it. Booking now."

# Voice output: assistant must output only literal spoken words (no narration/actions)
VOICE_OUTPUT_INSTRUCTIONS = (
    "\n\nVoice output rules: Your replies are spoken aloud. Output ONLY the literal words to be spoken. "
    "Never include emojis, emoticons (e.g. :)), stage directions, or action narration such as (smiles), [laughs], *pause*, or standalone words like 'Smile' or 'Smiles' used as action text. "
    "Keep content suitable for text-to-speech: no markup, no parenthetical asides that are not meant to be spoken."
)


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


def _log_availability_guard(response: str, tool_slots: dict[str, Any]) -> None:
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


def normalize_tool_args(args: dict) -> dict:
    """Normalize tool args for stable caching/logging keys."""
    normalized: dict = {}
    for k, v in (args or {}).items():
        if v is None:
            continue
        if k == "duration_minutes" and isinstance(v, str):
            try:
                normalized[k] = int(v) or 30
            except (ValueError, TypeError):
                normalized[k] = 30
        elif k == "price_cents" and v is not None:
            try:
                normalized[k] = int(v)
            except (TypeError, ValueError):
                continue
        elif k == "attendees" and isinstance(v, list):
            normalized[k] = [x for x in v if isinstance(x, str)]
        else:
            normalized[k] = v
    return normalized


def make_calendar_tool_exec(
    *,
    config: dict[str, Any],
    on_audio: Callable[[bytes], Awaitable[None]],
    on_error: Optional[Callable[[Exception], None]],
    tts_failure_logged: list[bool],
    offered_slots_state: dict[str, Any],
) -> Callable[[str, dict], Awaitable[str]]:
    """
    Create a per-turn tool_exec coroutine that:
    - speaks a short filler phrase once per turn before first calendar tool call
    - dedupes identical calendar tool calls within the turn (tool name + normalized args)
    - calls the voice calendar API with normalized args
    """
    pre_tool_spoken_this_turn = False
    skip_pre_tool_speech = bool(config.get("skip_pre_tool_speech"))
    tool_cache: dict[tuple[str, str], str] = {}

    base_url = config.get("voice_server_base_url")
    api_key = config.get("voice_server_api_key")
    rec_id = config.get("receptionist_id")
    caller_phone = (config.get("caller_phone") or "").strip() or None
    call_control_id = (config.get("call_control_id") or "").strip() or None

    async def _maybe_pre_tool_speech(tool_name: str) -> None:
        nonlocal pre_tool_spoken_this_turn
        if skip_pre_tool_speech:
            return
        if pre_tool_spoken_this_turn:
            return
        if tool_name not in CALENDAR_TOOL_NAMES:
            return
        pre_tool_spoken_this_turn = True
        t_pre = time.perf_counter()
        logger.info("[BOOKING_LATENCY] pre_tool_speech_start tool=%s t=%.3f", tool_name, t_pre)
        phrase = PRE_TOOL_FILLER_PHRASE
        logger.info("[CALL_DIAG] pre_tool_speech_sent tool=%s text=%r", tool_name, phrase)
        await generate_and_send_tts(
            phrase,
            config,
            on_audio,
            on_error,
            _tts_failure_logged=tts_failure_logged,
        )

    async def tool_exec(name: str, args: dict) -> str:
        if name in CALENDAR_TOOL_NAMES:
            normalized = normalize_tool_args(args)
            if name == "create_appointment" and caller_phone and not normalized.get("caller_phone"):
                normalized["caller_phone"] = caller_phone
            key = (name, json.dumps(normalized, sort_keys=True, separators=(",", ":")))
            if key in tool_cache:
                logger.info(
                    "[CALL_DIAG] tool_exec_dedupe_hit tool=%s key=%s",
                    name,
                    key[1][:200],
                )
                return tool_cache[key]

            await _maybe_pre_tool_speech(name)

            if name == "create_appointment":
                has_start = bool(normalized.get("start_time") or normalized.get("date_text"))
                has_duration = bool(normalized.get("duration_minutes"))
                has_summary = bool((normalized.get("summary") or "").strip())
                missing = []
                if not has_start:
                    missing.append("start_time/date_text")
                if not has_duration:
                    missing.append("duration_minutes")
                if not has_summary:
                    missing.append("summary")
                logger.info(
                    "[CALL_DIAG] tool_exec_call tool=create_appointment has_start=%s has_duration=%s has_summary=%s missing=%s",
                    has_start,
                    has_duration,
                    has_summary,
                    ",".join(missing) if missing else "",
                )
            else:
                logger.info(
                    "[CALL_DIAG] tool_exec_call tool=%s args=%s",
                    name,
                    key[1][:250],
                )

            if not (base_url and api_key and rec_id):
                result = '{"success": false, "error": "calendar_not_configured"}'
                tool_cache[key] = result
                return result

            t_tool_start = time.perf_counter()
            logger.info("[BOOKING_LATENCY] calendar_tool_start tool=%s t=%.3f", name, t_tool_start)
            result = await call_calendar_tool(base_url, api_key, rec_id, name, normalized, call_control_id=call_control_id)
            t_tool_end = time.perf_counter()
            logger.info("[BOOKING_LATENCY] calendar_tool_end tool=%s duration_ms=%.0f", name, (t_tool_end - t_tool_start) * 1000)
            if name == "check_availability" and result:
                try:
                    parsed = json.loads(result)
                    if parsed.get("success") is True:
                        offered_slots_state["exact_slots"] = parsed.get("exact_slots") or []
                        offered_slots_state["suggested_slots"] = parsed.get("suggested_slots") or []
                        offered_slots_state["summary_periods"] = parsed.get("summary_periods") or []
                        dt = (normalized.get("date_text") or "").strip()
                        if dt:
                            offered_slots_state["last_date_text"] = dt
                except (json.JSONDecodeError, TypeError):
                    pass
            if name == "create_appointment" and result:
                try:
                    parsed = json.loads(result)
                    if parsed.get("success") is True:
                        sms = parsed.get("sms_followup")
                        vs = config.get("voice_session")
                        if sms and isinstance(vs, dict):
                            vs["sms"] = sms
                        for f in (
                            "followup_message_resolved",
                            "payment_link",
                            "meeting_instructions",
                            "owner_selected_platform",
                            "sms_followup",
                        ):
                            parsed.pop(f, None)
                        result = json.dumps(parsed)
                        offered_slots_state["exact_slots"] = []
                        offered_slots_state["suggested_slots"] = []
                        offered_slots_state["summary_periods"] = []
                        vs = config.get("voice_session")
                        if isinstance(vs, dict):
                            vs["booking_completed"] = True
                except (json.JSONDecodeError, TypeError):
                    pass
            tool_cache[key] = result
            return result

        return '{"success": false, "error": "Unknown tool: ' + name + '"}'

    return tool_exec


def _passes_transcript_guard(text: str) -> bool:
    """Allow transcripts that are long enough, in whitelist, or substantive. Reject filler-only."""
    s = (text or "").strip()
    if len(s) < 2:
        return False
    norm = _normalize_for_whitelist(s)
    if norm in SHORT_UTTERANCE_WHITELIST:
        return True
    if len(s) == 2 and norm not in SHORT_UTTERANCE_WHITELIST:
        return False
    words = s.lower().split()
    if len(words) == 1 and words[0] in FILLER_WORDS:
        return False
    if len(words) <= 2 and all(w in FILLER_WORDS for w in words):
        return False
    return True


def _is_incomplete_transcript(text: str) -> bool:
    """Return True if transcript ends in a dangling phrase and caller likely has more to say."""
    s = (text or "").strip().lower()
    if not s:
        return False
    if s in INCOMPLETE_SINGLE_WORDS:
        return True
    return any(s.endswith(ending) or s == ending.strip() for ending in INCOMPLETE_PHRASE_ENDINGS)


def _is_whitelisted_short_utterance(text: str) -> bool:
    """Return True if transcript is a known short complete utterance that should trigger immediately."""
    norm = _normalize_for_whitelist(text)
    if not norm:
        return False
    if norm in SHORT_UTTERANCE_WHITELIST:
        return True
    # Also match "9 am" -> "9am" style (whitelist has both)
    collapsed = norm.replace(" ", "")
    return collapsed in SHORT_UTTERANCE_WHITELIST


def _is_post_booking_followup_message(text: str) -> bool:
    """Common follow-up after booking; should not sit in debounce limbo."""
    norm = _normalize_for_whitelist(text)
    if not norm:
        return False
    return any(
        p in norm
        for p in (
            "anything else",
            "any thing else",
            "need to know",
            "is that all",
            "that all",
            "something else",
            "what else",
            "one more thing",
            "anything i should",
        )
    )


def _contains_clear_intent(text: str) -> bool:
    """True when transcript clearly expresses booking/help intent."""
    norm = _normalize_for_whitelist(text)
    if not norm:
        return False
    if _is_post_booking_followup_message(text):
        return True
    if "?" in (text or "") and any(h in norm for h in INTENT_HINTS):
        return True
    return any(h in norm for h in INTENT_HINTS)


def _extract_date_text_hint(text: str) -> Optional[str]:
    norm = _normalize_for_whitelist(text)
    if "tomorrow" in norm:
        return "tomorrow"
    if "today" in norm:
        return "today"
    return None


def _extract_time_hint(text: str) -> Optional[str]:
    norm = _normalize_for_whitelist(text)
    m = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", norm, flags=re.IGNORECASE)
    if m:
        hh = m.group(1)
        mm = m.group(2)
        ampm = m.group(3).lower()
        return f"{hh}:{mm} {ampm}" if mm else f"{hh} {ampm}"
    words = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
        "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
    }
    m2 = re.search(r"\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(am|pm)\b", norm)
    if m2:
        return f"{words[m2.group(1)]} {m2.group(2)}"
    return None


def _is_booking_confirmation_intent(text: str) -> bool:
    norm = _normalize_for_whitelist(text)
    if not norm:
        return False
    has_time = _extract_time_hint(text) is not None
    wants_booking = any(k in norm for k in ("book", "please", "that works", "works", "schedule"))
    return has_time and wants_booking


def _is_availability_intent(text: str) -> bool:
    norm = _normalize_for_whitelist(text)
    return any(k in norm for k in ("availability", "available", "spot", "book", "tomorrow", "today"))


def _to_spoken_slot(slot: str) -> str:
    try:
        dt = datetime.fromisoformat(slot.replace("Z", "+00:00"))
        return dt.strftime("%-I:%M %p").lower()
    except Exception:
        return slot


def _slots_sentence(slots: list[str]) -> str:
    spoken = [_to_spoken_slot(s) for s in slots[:3]]
    if not spoken:
        return ""
    if len(spoken) == 1:
        return spoken[0]
    if len(spoken) == 2:
        return f"{spoken[0]} or {spoken[1]}"
    return f"{spoken[0]}, {spoken[1]}, or {spoken[2]}"


def _truth_aware_sms_line(voice_session: dict[str, Any] | None) -> str:
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


def _template_from_tool_result(
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
            return f"I found {_slots_sentence(slots)} for {day_text}. Which works best?"
        return "I don't have open slots in that window. Want me to check another day?"

    if tool_name == "create_appointment":
        start = (parsed.get("start_time") or "").strip()
        sms_line = _truth_aware_sms_line(voice_session)
        if start:
            base = f"You're all set for {_to_spoken_slot(start)}."
            return base + sms_line if sms_line else base
        if requested_time:
            date_part = requested_date or "that day"
            base = f"You're all set for {requested_time} {date_part}."
            return base + sms_line if sms_line else base
        base = "You're all set."
        return base + sms_line if sms_line else base
    return None


def _deterministic_post_booking_reply(user_text: str, voice_session: dict[str, Any]) -> Optional[str]:
    """One short truth-aware reply for common post-booking questions; no chains."""
    if not voice_session.get("booking_completed"):
        return None
    if not _is_post_booking_followup_message(user_text):
        return None
    sms_line = _truth_aware_sms_line(voice_session).strip()
    if sms_line:
        return f"You're all set.{sms_line}"
    return "You're all set. If anything changes, just call us back."


async def run_voice_pipeline(
    config: dict[str, Any],
    on_audio: Callable[[bytes], Awaitable[None]],
    on_error: Optional[Callable[[Exception], None]] = None,
) -> tuple[Callable[[bytes], None], Callable[[], None]]:
    """
    Run the voice pipeline. Returns (send_audio, stop).
    send_audio(chunk) sends audio to Deepgram.
    stop() closes the pipeline.

    Turn-taking: Grok is only called when a user turn is complete (speech_final or UtteranceEnd).
    Debounce prevents duplicate triggers from tiny transcript updates.
    New caller speech cancels any pending or in-flight response.
    """
    system_content = (config.get("system_prompt") or "") + VOICE_OUTPUT_INSTRUCTIONS
    history: list[dict[str, Any]] = [
        {"role": "system", "content": system_content},
    ]
    if config.get("greeting"):
        history.append({"role": "assistant", "content": config["greeting"]})

    transcript_buffer: list[str] = []
    is_processing = False
    debounce_task: Optional[asyncio.Task] = None
    grok_task: Optional[asyncio.Task] = None
    turn_complete_transcript = ""
    turn_complete_confidence: Optional[float] = None
    last_rich_transcript = ""
    last_rich_transcript_ts = 0.0
    dg_ws: Any = None
    dg_task: Optional[asyncio.Task] = None
    tts_failure_logged: list[bool] = [False]
    tts_state: dict[str, int] = {"requests": 0, "chars": 0}
    config["tts_state"] = tts_state
    config.setdefault("tts_provider", (settings.tts_provider or "google").strip().lower())

    offered_slots_state: dict[str, Any] = {}
    voice_session: dict[str, Any] = {}
    config["voice_session"] = voice_session
    pending_turn_queue: deque[tuple[str, Optional[float], int]] = deque()
    dispatch_commit_id_holder: dict[str, Optional[int]] = {"id": None}
    commit_seq = 0
    active_debounce_commit_id: list[Optional[int]] = [None]

    def _cancel_pending_response() -> None:
        """Cancel debounce and in-flight Grok. Call when new caller speech arrives."""
        nonlocal debounce_task, grok_task
        if debounce_task and not debounce_task.done():
            debounce_task.cancel()
            debounce_task = None
            logger.info(
                "[TURN_GUARD] dispatch_cancelled reason=new_speech_or_interim commit_id=%s",
                active_debounce_commit_id[0],
            )
            active_debounce_commit_id[0] = None
            logger.debug("[turn] Debounce cancelled (new speech)")
        if grok_task and not grok_task.done():
            grok_task.cancel()
            grok_task = None
            logger.debug("[turn] Grok task cancelled (new speech)")

    async def process_user_input() -> None:
        nonlocal is_processing, grok_task, turn_complete_transcript, turn_complete_confidence
        user_text = turn_complete_transcript
        confidence = turn_complete_confidence
        turn_complete_transcript = ""
        turn_complete_confidence = None

        cid = dispatch_commit_id_holder["id"]
        dispatch_commit_id_holder["id"] = None
        logger.info("[TURN_GUARD] dispatch_started path=process commit_id=%s", cid)

        is_processing = True
        grok_task = None
        try:
            if not user_text or not _passes_transcript_guard(user_text):
                logger.info("[TURN_GUARD] dispatch_skipped reason=guard_reject commit_id=%s", cid)
                return
            if confidence is not None and confidence < MIN_CONFIDENCE:
                if not _is_whitelisted_short_utterance(user_text):
                    logger.info("[TURN_GUARD] dispatch_skipped reason=low_confidence commit_id=%s", cid)
                    return
                logger.info(
                    "[TURN_GUARD] low_confidence_whitelist_bypass transcript=%s confidence=%.2f",
                    user_text[:80],
                    confidence,
                )

            vs = config.get("voice_session") or {}
            dpb = _deterministic_post_booking_reply(user_text, vs if isinstance(vs, dict) else {})
            if dpb:
                history.append({"role": "user", "content": user_text})
                history.append({"role": "assistant", "content": dpb})
                logger.info("[turn] TTS started response_len=%d (post_booking_deterministic)", len(dpb))
                await generate_and_send_tts(
                    dpb,
                    config,
                    on_audio,
                    on_error,
                    _tts_failure_logged=tts_failure_logged,
                )
                return

            logger.info("[turn] Grok task started transcript=%r", user_text[:80])
            t_turn_start = time.perf_counter()
            logger.info("[BOOKING_LATENCY] turn_start t=%.3f", t_turn_start)

            history.append({"role": "user", "content": user_text})
            if len(history) > MAX_HISTORY + 2:
                history[2 : 2 + len(history) - MAX_HISTORY - 2] = []

            use_calendar = (
                config.get("receptionist_id")
                and config.get("voice_server_api_key")
                and config.get("voice_server_base_url")
            )
            if use_calendar:
                fast_date = _extract_date_text_hint(user_text)
                fast_time = _extract_time_hint(user_text)
                fast_tool_name = None
                fast_tool_args: dict[str, Any] = {}

                slot_fast = False
                if not is_new_availability_search_intent(user_text):
                    sr = resolve_slot_selection(user_text, offered_slots_state)
                    if sr.ok and sr.slot_iso:
                        slot_fast = True
                        fast_tool_name = "create_appointment"
                        fast_tool_args = {
                            "start_time": sr.slot_iso,
                            "duration_minutes": 30,
                            "summary": "Appointment",
                            "generic_appointment_requested": True,
                        }
                        fast_date = (offered_slots_state.get("last_date_text") or "").strip() or fast_date
                        fast_time = None
                        logger.info(
                            "[CALL_DIAG] slot_selection_fast_path_selected transcript=%s",
                            user_text[:120],
                        )
                        logger.info(
                            "[CALL_DIAG] slot_selection_resolved slot=%s source=%s",
                            sr.slot_iso[:48],
                            sr.source,
                        )
                    elif sr.ambiguous:
                        logger.info("[CALL_DIAG] slot_selection_ambiguous transcript=%s", user_text[:120])
                        logger.info("[CALL_DIAG] slot_selection_fallback_to_llm reason=ambiguous")
                    else:
                        logger.debug("[CALL_DIAG] slot_selection_no_match transcript=%s", user_text[:80])

                if not slot_fast and _is_booking_confirmation_intent(user_text):
                    fast_tool_name = "create_appointment"
                    date_and_time = " ".join(
                        [p for p in [fast_date, ("at " + fast_time) if fast_time else None] if p]
                    ).strip()
                    if date_and_time:
                        fast_tool_args["date_text"] = date_and_time
                    if not fast_tool_args.get("date_text"):
                        fast_tool_name = None
                    else:
                        fast_tool_args["summary"] = "Appointment"
                        fast_tool_args["generic_appointment_requested"] = True
                elif not slot_fast and _is_availability_intent(user_text):
                    fast_tool_name = "check_availability"
                    fast_tool_args = {
                        "date_text": fast_date or "tomorrow",
                        "generic_appointment_requested": True,
                    }

                if fast_tool_name:
                    logger.info(
                        "[CALL_DIAG] fast_path_selected tool=%s transcript=%s args=%s",
                        fast_tool_name,
                        user_text[:120],
                        json.dumps(fast_tool_args, separators=(",", ":"), sort_keys=True)[:220],
                    )
                    pre_ack = FAST_ACK_BOOKING if fast_tool_name == "create_appointment" else FAST_ACK_AVAILABILITY
                    logger.info("[CALL_DIAG] pre_ack_sent text=%r", pre_ack)
                    await generate_and_send_tts(
                        pre_ack,
                        config,
                        on_audio,
                        on_error,
                        _tts_failure_logged=tts_failure_logged,
                    )

                prev_skip_pre_tool = bool(config.get("skip_pre_tool_speech"))
                if fast_tool_name:
                    config["skip_pre_tool_speech"] = True
                tool_exec = make_calendar_tool_exec(
                    config=config,
                    on_audio=on_audio,
                    on_error=on_error,
                    tts_failure_logged=tts_failure_logged,
                    offered_slots_state=offered_slots_state,
                )

                if fast_tool_name:
                    logger.info("[CALL_DIAG] tool_direct_dispatch tool=%s", fast_tool_name)
                    fast_result = await tool_exec(fast_tool_name, fast_tool_args)
                    templated = _template_from_tool_result(
                        fast_tool_name,
                        fast_result,
                        requested_date=fast_date,
                        requested_time=fast_time,
                        voice_session=config.get("voice_session"),
                    )
                    if templated:
                        logger.info("[CALL_DIAG] template_response_used type=%s", fast_tool_name)
                        history.append({"role": "assistant", "content": templated})
                        logger.info("[turn] TTS started response_len=%d", len(templated))
                        t_tts_start = time.perf_counter()
                        logger.info(
                            "[BOOKING_LATENCY] tts_start t=%.3f response_len=%d",
                            t_tts_start,
                            len(templated),
                        )
                        await generate_and_send_tts(
                            templated,
                            config,
                            on_audio,
                            on_error,
                            _tts_failure_logged=tts_failure_logged,
                        )
                        config["skip_pre_tool_speech"] = prev_skip_pre_tool
                        t_turn_end = time.perf_counter()
                        logger.info(
                            "[BOOKING_LATENCY] turn_end total_ms=%.0f tts_ms=%.0f fast_path=true",
                            (t_turn_end - t_turn_start) * 1000,
                            (t_turn_end - t_tts_start) * 1000,
                        )
                        return
                    logger.info(
                        "[CALL_DIAG] llm_fallback_used reason=template_unavailable tool=%s",
                        fast_tool_name,
                    )
                    config["skip_pre_tool_speech"] = prev_skip_pre_tool

                response = await chat_with_tools(
                    history,
                    CALENDAR_TOOLS,
                    tool_exec,
                    config["grok_api_key"],
                )
            else:
                response = await chat(history, config["grok_api_key"])

            history.append({"role": "assistant", "content": response})
            if use_calendar and offered_slots_state:
                _log_availability_guard(response, offered_slots_state)
            logger.info("[turn] TTS started response_len=%d", len(response))
            t_tts_start = time.perf_counter()
            logger.info("[BOOKING_LATENCY] tts_start t=%.3f response_len=%d", t_tts_start, len(response))
            await generate_and_send_tts(
                response, config, on_audio, on_error,
                _tts_failure_logged=tts_failure_logged,
            )
            t_turn_end = time.perf_counter()
            logger.info("[BOOKING_LATENCY] turn_end total_ms=%.0f tts_ms=%.0f", (t_turn_end - t_turn_start) * 1000, (t_turn_end - t_tts_start) * 1000)
        except asyncio.CancelledError:
            logger.debug("[turn] Grok task cancelled")
            raise
        except Exception as err:
            if on_error:
                on_error(err)
            await generate_and_send_tts(
                "I'm sorry, I didn't catch that. Could you repeat that?",
                config,
                on_audio,
                on_error,
                _tts_failure_logged=tts_failure_logged,
            )
        finally:
            is_processing = False
            if pending_turn_queue:
                t2, c2, cid2 = pending_turn_queue.popleft()
                turn_complete_transcript = t2
                turn_complete_confidence = c2
                dispatch_commit_id_holder["id"] = cid2
                logger.info("[TURN_GUARD] dispatch_started path=queued_flush commit_id=%s", cid2)
                grok_task = asyncio.create_task(process_user_input())

    def _schedule_trigger(alts: list) -> None:
        """Schedule Grok after debounce. Only one response per user turn."""
        nonlocal debounce_task, turn_complete_transcript, turn_complete_confidence, grok_task, commit_seq

        if debounce_task and not debounce_task.done():
            debounce_task.cancel()
            debounce_task = None

        full_transcript = " ".join(transcript_buffer).strip()
        confidence = alts[0].get("confidence") if alts else None

        logger.debug(
            "[turn] Turn end detected transcript=%r interim_buf_len=%d confidence=%s",
            full_transcript[:50] if full_transcript else "",
            len(transcript_buffer),
            confidence,
        )

        if not full_transcript:
            logger.debug("[turn] Trigger skipped: empty transcript")
            transcript_buffer.clear()
            return

        if _is_incomplete_transcript(full_transcript) and not _contains_clear_intent(full_transcript):
            logger.info("[TURN_GUARD] incomplete_transcript_wait transcript=%s", full_transcript[:80])
            return

        commit_reason = "default"
        commit_text = full_transcript
        is_short_whitelist = _is_whitelisted_short_utterance(full_transcript)
        has_clear_intent = _contains_clear_intent(full_transcript)

        # Prevent short trailing fragments ("hi", "hello") from overriding a richer
        # caller turn that was captured moments earlier.
        now_mono = time.monotonic()
        if is_short_whitelist and last_rich_transcript and (now_mono - last_rich_transcript_ts) <= 8.0:
            commit_text = last_rich_transcript
            commit_reason = "reuse_recent_rich_transcript"
        elif has_clear_intent:
            commit_reason = "clear_intent_final"
        elif is_short_whitelist:
            commit_reason = "short_whitelist_final"

        transcript_buffer.clear()

        commit_seq += 1
        commit_id = commit_seq
        logger.info(
            "[TURN_GUARD] commit_candidate reason=%s transcript=%s",
            commit_reason,
            commit_text[:120],
        )
        logger.info("[TURN_GUARD] commit_enqueued commit_id=%s", commit_id)

        words = commit_text.lower().split()
        word_count = len(words)

        # Fail-open policy: final short-whitelist or clear-intent utterances dispatch immediately.
        if is_short_whitelist or has_clear_intent:
            turn_complete_transcript = commit_text
            turn_complete_confidence = confidence
            if not is_processing:
                dispatch_commit_id_holder["id"] = commit_id
                logger.info(
                    "[TURN_GUARD] dispatch_started path=immediate reason=%s commit_id=%s transcript=%s",
                    commit_reason,
                    commit_id,
                    commit_text[:120],
                )
                grok_task = asyncio.create_task(process_user_input())
            else:
                pending_turn_queue.append((commit_text, confidence, commit_id))
                logger.info(
                    "[TURN_GUARD] dispatch_skipped reason=queued_for_after_processing commit_id=%s transcript=%s",
                    commit_id,
                    commit_text[:120],
                )
            return

        if word_count <= SHORT_PAUSE_MAX_WORDS:
            debounce_ms = DEBOUNCE_MS_FALLBACK
            logger.info("[TURN_GUARD] short_utterance_fallback_trigger transcript=%s", commit_text[:80])
        else:
            debounce_ms = DEBOUNCE_MS

        snap_text, snap_conf, snap_id = commit_text, confidence, commit_id

        def _on_debounce_done(t: asyncio.Task) -> None:
            nonlocal debounce_task, grok_task
            debounce_task = None
            active_debounce_commit_id[0] = None
            if t.cancelled():
                logger.info(
                    "[TURN_GUARD] dispatch_cancelled reason=debounce_task_cancelled commit_id=%s",
                    snap_id,
                )
                return
            turn_complete_transcript = snap_text
            turn_complete_confidence = snap_conf
            if not is_processing:
                dispatch_commit_id_holder["id"] = snap_id
                logger.info(
                    "[TURN_GUARD] dispatch_started path=debounce commit_id=%s debounce_ms=%s",
                    snap_id,
                    debounce_ms,
                )
                grok_task = asyncio.create_task(process_user_input())
            else:
                pending_turn_queue.append((snap_text, snap_conf, snap_id))
                logger.info(
                    "[TURN_GUARD] dispatch_skipped reason=queued_after_debounce commit_id=%s",
                    snap_id,
                )

        active_debounce_commit_id[0] = commit_id
        debounce_task = asyncio.create_task(asyncio.sleep(debounce_ms / 1000.0))
        debounce_task.add_done_callback(_on_debounce_done)

    async def on_dg_message(msg: dict) -> None:
        nonlocal transcript_buffer, last_rich_transcript, last_rich_transcript_ts

        msg_type = msg.get("type", "Results")

        if msg_type == "UtteranceEnd":
            last_word_end = msg.get("last_word_end")
            if last_word_end == -1:
                logger.debug("[turn] UtteranceEnd ignored (last_word_end=-1, duplicate)")
                return
            logger.debug(
                "[turn] UtteranceEnd received last_word_end=%.2f buffer=%r",
                last_word_end or 0,
                transcript_buffer,
            )
            alts = []
            if isinstance(msg.get("channel"), dict):
                alts = msg["channel"].get("alternatives") or []
            _schedule_trigger(alts)
            return

        channel = msg.get("channel")
        if not isinstance(channel, dict):
            channel = {}
        alts = channel.get("alternatives") or []
        transcript = (alts[0].get("transcript") or "").strip() if alts else ""
        is_final = msg.get("is_final") is True
        speech_final = msg.get("speech_final") is True

        logger.debug(
            "[turn] Transcript received is_final=%s speech_final=%s transcript=%r",
            is_final,
            speech_final,
            transcript[:40] if transcript else "",
        )

        if transcript and not speech_final:
            _cancel_pending_response()

        if is_final and transcript:
            transcript_buffer.append(transcript)
            # Save richer final transcripts so short trailing utterances do not erase intent.
            if _contains_clear_intent(transcript) or len((transcript or "").split()) >= 5:
                last_rich_transcript = transcript
                last_rich_transcript_ts = time.monotonic()
            if not speech_final and _is_whitelisted_short_utterance(transcript):
                logger.info(
                    "[TURN_GUARD] final_short_utterance_trigger transcript=%s",
                    transcript[:80],
                )
                _schedule_trigger(alts)
                return

        if speech_final:
            logger.debug("[turn] speech_final=True, scheduling trigger")
            _schedule_trigger(alts)

    def on_dg_error(err: Exception) -> None:
        logger.error("Deepgram error: %s", err)
        if on_error:
            on_error(err)

    dg_ws, dg_task = await create_deepgram_live(
        api_key=config["deepgram_api_key"],
        encoding="mulaw",
        sample_rate=8000,
        on_message=on_dg_message,
        on_error=on_dg_error,
    )

    # Play recording consent phrase first when configured; then mark consent as played for CDR
    on_consent_played = config.get("on_consent_played")
    consent_phrase = config.get("consent_phrase")
    if consent_phrase and callable(on_consent_played):
        await generate_and_send_tts(
            consent_phrase, config, on_audio, on_error,
            _tts_failure_logged=tts_failure_logged,
        )
        try:
            if asyncio.iscoroutinefunction(on_consent_played):
                await on_consent_played()
            else:
                on_consent_played()
        except Exception as e:
            logger.warning("[voice/stream] on_consent_played callback failed: %s", e)
        logger.info("[voice/stream] recording consent phrase sent; consent marked as played for this call")
    if config.get("greeting"):
        asyncio.create_task(
            generate_and_send_tts(
                config["greeting"], config, on_audio, on_error,
                _tts_failure_logged=tts_failure_logged,
            )
        )

    def send_audio(chunk: bytes) -> None:
        if dg_ws:
            try:
                asyncio.create_task(dg_ws.send(chunk))
            except Exception:
                pass

    def stop() -> None:
        if debounce_task and not debounce_task.done():
            debounce_task.cancel()
        if grok_task and not grok_task.done():
            grok_task.cancel()
        if dg_task and not dg_task.done():
            dg_task.cancel()
        if dg_ws:
            asyncio.create_task(dg_ws.close())

    return send_audio, stop
