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
SHORT_ALLOWED = frozenset({"hi", "no", "ok", "oh"})


def _passes_transcript_guard(text: str) -> bool:
    """Allow transcripts that are long enough or in the short whitelist."""
    s = (text or "").strip()
    if len(s) < 2:
        return False
    if len(s) == 2 and s.lower() not in SHORT_ALLOWED:
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
    """
    history: list[dict[str, Any]] = [
        {"role": "system", "content": config["system_prompt"]},
    ]
    if config.get("greeting"):
        history.append({"role": "assistant", "content": config["greeting"]})

    pending_transcript = ""
    transcript_buffer: list[str] = []
    is_processing = False
    task_scheduled = False
    dg_ws: Any = None
    dg_task: Optional[asyncio.Task] = None
    tts_failure_logged: list[bool] = [False]

    async def process_user_input() -> None:
        nonlocal is_processing, pending_transcript, task_scheduled
        task_scheduled = False
        user_text = pending_transcript
        pending_transcript = ""
        if not user_text or not _passes_transcript_guard(user_text):
            return
        is_processing = True
        try:
            history.append({"role": "user", "content": user_text})
            if len(history) > MAX_HISTORY + 2:
                history[2:2 + len(history) - MAX_HISTORY - 2] = []

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
            await generate_and_send_tts(
                response, config, on_audio, on_error,
                _tts_failure_logged=tts_failure_logged,
            )
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
            if pending_transcript:
                task_scheduled = True
                asyncio.create_task(process_user_input())

    def _trigger_process(alts: list) -> None:
        """Process transcript buffer and schedule LLM if not already busy."""
        nonlocal pending_transcript, task_scheduled
        full_transcript = " ".join(transcript_buffer).strip()
        transcript_buffer.clear()
        if not full_transcript or not _passes_transcript_guard(full_transcript):
            return
        confidence = alts[0].get("confidence") if alts else None
        if confidence is not None and confidence < 0.35:
            return
        pending_transcript = full_transcript
        if not is_processing and not task_scheduled:
            task_scheduled = True
            asyncio.create_task(process_user_input())

    async def on_dg_message(msg: dict) -> None:
        nonlocal pending_transcript, transcript_buffer
        channel = msg.get("channel")
        if not isinstance(channel, dict):
            channel = {}
        alts = channel.get("alternatives") or []
        transcript = (alts[0].get("transcript") or "").strip() if alts else ""
        is_final = msg.get("is_final") is True
        speech_final = msg.get("speech_final") is True
        utterance_end = msg.get("type") == "UtteranceEnd"

        if is_final and transcript:
            transcript_buffer.append(transcript)

        if speech_final or utterance_end:
            _trigger_process(alts)

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

    # Send greeting TTS on connect
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
        if dg_task and not dg_task.done():
            dg_task.cancel()
        if dg_ws:
            asyncio.create_task(dg_ws.close())

    return send_audio, stop
