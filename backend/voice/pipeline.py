"""Voice pipeline: Deepgram STT -> Grok LLM -> TTS (Google Cloud)."""

import asyncio
import json
import logging
import time
from collections import deque
from typing import Any, Callable, Awaitable, Optional

from config import settings
from voice.calendar_tools import CALENDAR_TOOLS, call_calendar_tool
from voice.deepgram_client import create_deepgram_live
from voice.grok_client import chat, chat_with_tools
from voice.pipeline_templates import (
    deterministic_post_booking_reply,
    log_availability_guard,
    template_from_tool_result,
)
from voice.pipeline_transcript import (
    contains_clear_intent,
    extract_date_text_hint,
    extract_time_hint,
    is_availability_intent,
    is_booking_confirmation_intent,
    is_incomplete_transcript,
    is_whitelisted_short_utterance,
    passes_transcript_guard,
)
from voice.slot_selection import is_new_availability_search_intent, resolve_slot_selection
from voice.tts_facade import generate_and_send_tts

logger = logging.getLogger(__name__)

MAX_HISTORY = 20
DEBOUNCE_MS = 1200
DEBOUNCE_MS_FALLBACK = 800
SHORT_PAUSE_MAX_WORDS = 4
MIN_CONFIDENCE = 0.35

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
        ac = config.get("active_turn_commit_id")
        logger.info(
            "[turn] TTS started commit_id=%s response_len=%d (pre_tool_filler)",
            ac,
            len(phrase),
        )
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

        config["active_turn_commit_id"] = cid
        is_processing = True
        grok_task = None
        try:
            if not user_text or not passes_transcript_guard(user_text):
                logger.info("[TURN_GUARD] dispatch_skipped reason=guard_reject commit_id=%s", cid)
                return
            if confidence is not None and confidence < MIN_CONFIDENCE:
                if not is_whitelisted_short_utterance(user_text):
                    logger.info("[TURN_GUARD] dispatch_skipped reason=low_confidence commit_id=%s", cid)
                    return
                logger.info(
                    "[TURN_GUARD] low_confidence_whitelist_bypass transcript=%s confidence=%.2f",
                    user_text[:80],
                    confidence,
                )

            vs = config.get("voice_session") or {}
            dpb = deterministic_post_booking_reply(user_text, vs if isinstance(vs, dict) else {})
            if dpb:
                history.append({"role": "user", "content": user_text})
                history.append({"role": "assistant", "content": dpb})
                logger.info(
                    "[turn] TTS started commit_id=%s response_len=%d (post_booking_deterministic)",
                    cid,
                    len(dpb),
                )
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
                fast_date = extract_date_text_hint(user_text)
                fast_time = extract_time_hint(user_text)
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

                if not slot_fast and is_booking_confirmation_intent(user_text):
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
                elif not slot_fast and is_availability_intent(user_text):
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
                    logger.info(
                        "[turn] TTS started commit_id=%s response_len=%d (pre_ack)",
                        cid,
                        len(pre_ack),
                    )
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
                    templated = template_from_tool_result(
                        fast_tool_name,
                        fast_result,
                        requested_date=fast_date,
                        requested_time=fast_time,
                        voice_session=config.get("voice_session"),
                    )
                    if templated:
                        logger.info("[CALL_DIAG] template_response_used type=%s", fast_tool_name)
                        history.append({"role": "assistant", "content": templated})
                        logger.info(
                            "[turn] TTS started commit_id=%s response_len=%d",
                            cid,
                            len(templated),
                        )
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
                log_availability_guard(response, offered_slots_state)
            logger.info(
                "[turn] TTS started commit_id=%s response_len=%d",
                cid,
                len(response),
            )
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
            apology = "I'm sorry, I didn't catch that. Could you repeat that?"
            logger.info(
                "[turn] TTS started commit_id=%s response_len=%d (error_apology)",
                cid,
                len(apology),
            )
            await generate_and_send_tts(
                apology,
                config,
                on_audio,
                on_error,
                _tts_failure_logged=tts_failure_logged,
            )
        finally:
            config.pop("active_turn_commit_id", None)
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

        if is_incomplete_transcript(full_transcript) and not contains_clear_intent(full_transcript):
            logger.info("[TURN_GUARD] incomplete_transcript_wait transcript=%s", full_transcript[:80])
            return

        commit_reason = "default"
        commit_text = full_transcript
        is_short_whitelist = is_whitelisted_short_utterance(full_transcript)
        has_clear_intent = contains_clear_intent(full_transcript)

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
            if contains_clear_intent(transcript) or len((transcript or "").split()) >= 5:
                last_rich_transcript = transcript
                last_rich_transcript_ts = time.monotonic()
            if not speech_final and is_whitelisted_short_utterance(transcript):
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
