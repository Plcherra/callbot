"""Voice pipeline: Deepgram STT -> Grok LLM -> ElevenLabs TTS."""

import asyncio
import logging
from typing import Any, Callable, Awaitable, Optional

import httpx

from voice.deepgram_client import create_deepgram_live
from voice.grok_client import chat, chat_with_tools
from voice.elevenlabs_client import text_to_speech_stream
from voice.calendar_tools import CALENDAR_TOOLS, call_calendar_tool

logger = logging.getLogger(__name__)

MAX_HISTORY = 20
SHORT_ALLOWED = frozenset({"hi", "no", "ok", "oh", "yeah", "yes"})
FILLER_WORDS = frozenset({"um", "uh", "hmm", "eh", "er", "ah", "like", "well", "so"})
DEBOUNCE_MS = 400
MIN_CONFIDENCE = 0.35


def _passes_transcript_guard(text: str) -> bool:
    """Allow transcripts that are long enough, in whitelist, or substantive. Reject filler-only."""
    s = (text or "").strip()
    if len(s) < 2:
        return False
    if len(s) == 2 and s.lower() not in SHORT_ALLOWED:
        return False
    words = s.lower().split()
    if len(words) == 1 and words[0] in FILLER_WORDS:
        return False
    if len(words) <= 2 and all(w in FILLER_WORDS for w in words):
        return False
    return True


async def generate_and_send_tts(
    text: str,
    config: dict[str, Any],
    on_audio: Callable[[bytes], Awaitable[None]],
    on_error: Optional[Callable[[Exception], None]] = None,
    is_fallback: bool = False,
    _tts_failure_logged: Optional[list[bool]] = None,
) -> None:
    """Generate TTS and send via callback. Avoids retry spam on ElevenLabs HTTP errors."""
    if not text or not text.strip():
        return
    tts_logged = _tts_failure_logged if _tts_failure_logged is not None else [False]

    try:
        async for chunk in text_to_speech_stream(
            text=text,
            voice_id=config["elevenlabs_voice_id"],
            api_key=config["elevenlabs_api_key"],
            output_format="ulaw_8000",
        ):
            await on_audio(chunk)
    except Exception as err:
        is_elevenlabs_http = (
            isinstance(err, httpx.HTTPStatusError)
            and "elevenlabs" in (str(err.request.url) if getattr(err, "request", None) else "")
        )
        if is_elevenlabs_http and not tts_logged[0]:
            tts_logged[0] = True
            logger.error(
                "[voice/stream] ElevenLabs TTS failed (404/401 etc): %s. Skipping retries.",
                err,
            )
        elif on_error and not is_elevenlabs_http:
            on_error(err)
        if not is_fallback and not is_elevenlabs_http:
            await generate_and_send_tts(
                "I'm sorry, I'm having trouble. Please try again.",
                config,
                on_audio,
                on_error,
                is_fallback=True,
                _tts_failure_logged=tts_logged,
            )


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
    history: list[dict[str, Any]] = [
        {"role": "system", "content": config["system_prompt"]},
    ]
    if config.get("greeting"):
        history.append({"role": "assistant", "content": config["greeting"]})

    transcript_buffer: list[str] = []
    is_processing = False
    debounce_task: Optional[asyncio.Task] = None
    grok_task: Optional[asyncio.Task] = None
    turn_complete_transcript = ""
    turn_complete_confidence: Optional[float] = None
    dg_ws: Any = None
    dg_task: Optional[asyncio.Task] = None
    tts_failure_logged: list[bool] = [False]

    def _cancel_pending_response() -> None:
        """Cancel debounce and in-flight Grok. Call when new caller speech arrives."""
        nonlocal debounce_task, grok_task
        if debounce_task and not debounce_task.done():
            debounce_task.cancel()
            debounce_task = None
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

        if not user_text or not _passes_transcript_guard(user_text):
            logger.debug(
                "[turn] Trigger rejected: empty/filler transcript=%r guard=%s",
                user_text[:50] if user_text else "",
                _passes_transcript_guard(user_text or ""),
            )
            return
        if confidence is not None and confidence < MIN_CONFIDENCE:
            logger.debug("[turn] Trigger rejected: low confidence=%.2f", confidence)
            return

        logger.info("[turn] Grok task started transcript=%r", user_text[:80])
        is_processing = True
        grok_task = None
        try:
            history.append({"role": "user", "content": user_text})
            if len(history) > MAX_HISTORY + 2:
                history[2 : 2 + len(history) - MAX_HISTORY - 2] = []

            use_calendar = (
                config.get("receptionist_id")
                and config.get("voice_server_api_key")
                and config.get("voice_server_base_url")
            )
            if use_calendar:
                base_url = config["voice_server_base_url"]
                api_key = config["voice_server_api_key"]
                rec_id = config["receptionist_id"]

                async def tool_exec(name: str, args: dict) -> str:
                    if name in ("check_availability", "create_appointment", "reschedule_appointment"):
                        return await call_calendar_tool(base_url, api_key, rec_id, name, args)
                    return '{"success": false, "error": "Unknown tool: ' + name + '"}'

                response = await chat_with_tools(
                    history,
                    CALENDAR_TOOLS,
                    tool_exec,
                    config["grok_api_key"],
                )
            else:
                response = await chat(history, config["grok_api_key"])

            history.append({"role": "assistant", "content": response})
            logger.info("[turn] TTS started response_len=%d", len(response))
            await generate_and_send_tts(
                response, config, on_audio, on_error,
                _tts_failure_logged=tts_failure_logged,
            )
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

    def _schedule_trigger(alts: list) -> None:
        """Schedule Grok after debounce. Only one response per user turn."""
        nonlocal debounce_task, turn_complete_transcript, turn_complete_confidence

        if debounce_task and not debounce_task.done():
            debounce_task.cancel()
            debounce_task = None

        full_transcript = " ".join(transcript_buffer).strip()
        transcript_buffer.clear()
        confidence = alts[0].get("confidence") if alts else None

        logger.debug(
            "[turn] Turn end detected transcript=%r interim_buf_len=%d confidence=%s",
            full_transcript[:50] if full_transcript else "",
            len(transcript_buffer),
            confidence,
        )

        if not full_transcript:
            logger.debug("[turn] Trigger skipped: empty transcript")
            return

        turn_complete_transcript = full_transcript
        turn_complete_confidence = confidence

        def _on_debounce_fire() -> None:
            nonlocal debounce_task, grok_task
            debounce_task = None
            if not is_processing:
                logger.debug("[turn] Debounce fired, scheduling process_user_input")
                grok_task = asyncio.create_task(process_user_input())
            else:
                logger.debug("[turn] Debounce fired but already processing, skipping")

        debounce_task = asyncio.create_task(
            asyncio.sleep(DEBOUNCE_MS / 1000.0)
        )
        debounce_task.add_done_callback(
            lambda t: _on_debounce_fire() if not t.cancelled() else None
        )

    async def on_dg_message(msg: dict) -> None:
        nonlocal transcript_buffer

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
