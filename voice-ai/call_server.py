"""
Twilio Media Streams WebSocket server for self-hosted voice AI.
Receives inbound audio from Twilio, runs Whisper → Ollama → Piper, sends TTS back.
Level 2: Per-call memory (keyed by stream_sid), call_sid/caller_phone for logging.
Run from project root: python voice-ai/call_server.py
"""
import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path

import httpx
import numpy as np
import ollama
import webrtcvad
from faster_whisper import WhisperModel
from piper.voice import PiperVoice
import websockets

from audio_utils import mulaw_to_pcm, pcm_to_mulaw, resample_pcm
from config import (
    CALENDAR_API_BASE_URL,
    CALENDAR_API_TIMEOUT,
    LLM_MODEL,
    MAX_TOOL_CALL_ROUNDS,
    PROMPT_API_BASE_URL,
    RETRY_CALENDAR_COUNT,
    RETRY_LLM_BACKOFF,
    RETRY_LLM_COUNT,
    RETRY_PROMPT_BACKOFF,
    RETRY_PROMPT_COUNT,
    SILENCE_TIMEOUT,
    SILENCE_TIMEOUT_AFTER_PLAYBACK,
    STT_MIN_AVG_LOGPROB,
    STT_NO_SPEECH_PROB_THRESHOLD,
    VAD_AGGRESSIVENESS,
    VOICE_PATH,
    VOICE_SERVER_API_KEY,
    WHISPER_MODEL,
    WS_HOST,
    WS_PORT,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Per-call memory (short-term, within call). Key = stream_sid. Cleaned on disconnect. ---
MAX_HISTORY_MESSAGES = 20  # 10 user + 10 assistant turns

@dataclass
class CallState:
    """In-memory state for one call. Keyed by stream_sid."""
    stream_sid: str
    receptionist_id: str | None
    call_sid: str | None
    caller_phone: str | None
    conversation_history: list[dict] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)

call_memory: dict[str, CallState] = {}

# webrtcvad frame: 30ms at 16kHz = 480 samples
VAD_FRAME_MS = 30
SAMPLE_RATE = 16000
TWILIO_SAMPLE_RATE = 8000

# Load models once at startup
piper_voice = PiperVoice.load(str(VOICE_PATH))
whisper_model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
vad = webrtcvad.Vad(VAD_AGGRESSIVENESS)

FALLBACK_PROMPT = """You are an AI receptionist for small businesses. Be warm, professional, and concise.
Keep responses short (2-4 sentences) for phone conversation. Help with appointments and general questions."""

# Fallback when STT confidence is too low (noise, mumbling). Say this instead of staying silent.
STT_LOW_CONFIDENCE_RESPONSE = "I'm sorry, I didn't catch that. Could you repeat that for me?"

# --- Calendar tool definitions for Ollama (OpenAPI-style). Used when receptionist_id is set. ---
CALENDAR_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "check_availability",
            "description": "Check available time slots on the business calendar for a given date or date range. Use when the caller wants to book or know when the business is free.",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {"type": "string", "description": "Start date (ISO date e.g. 2025-02-25 or full ISO datetime)"},
                    "end_date": {"type": "string", "description": "Optional end date (ISO). If omitted, one day from start_date is used."},
                    "duration_minutes": {"type": "integer", "description": "Slot length in minutes (default 30)"},
                    "timezone": {"type": "string", "description": "IANA timezone (e.g. America/New_York)"},
                },
                "required": ["start_date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_appointment",
            "description": "Create a new appointment on the calendar. Use after confirming service, date, time, and caller name. Never create without confirming.",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_time": {"type": "string", "description": "Start time in ISO 8601 datetime (e.g. 2025-02-25T14:00:00)"},
                    "duration_minutes": {"type": "integer", "description": "Duration in minutes"},
                    "summary": {"type": "string", "description": "Short title for the appointment (e.g. 'Haircut - John')"},
                    "description": {"type": "string", "description": "Optional longer description"},
                    "attendees": {"type": "array", "items": {"type": "string"}, "description": "Optional list of email addresses"},
                },
                "required": ["start_time", "duration_minutes", "summary"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reschedule_appointment",
            "description": "Move an existing appointment to a new time. Use when the caller wants to change their appointment time.",
            "parameters": {
                "type": "object",
                "properties": {
                    "event_id": {"type": "string", "description": "The calendar event ID of the appointment to move (from a previous create or check response)"},
                    "new_start": {"type": "string", "description": "New start time in ISO 8601 datetime"},
                    "duration_minutes": {"type": "integer", "description": "Duration in minutes (can be same as before)"},
                },
                "required": ["event_id", "new_start", "duration_minutes"],
            },
        },
    },
]


def _get_calendar_base_url() -> str:
    base = (CALENDAR_API_BASE_URL or PROMPT_API_BASE_URL or "").rstrip("/")
    return base or "http://localhost:3000"


async def call_calendar_api(receptionist_id: str, action: str, params: dict) -> dict:
    """POST to Next.js /api/voice/calendar. Returns JSON body as dict. Retries once on 5xx/timeout."""
    url = f"{_get_calendar_base_url()}/api/voice/calendar"
    headers = {}
    if VOICE_SERVER_API_KEY:
        headers["x-voice-server-key"] = VOICE_SERVER_API_KEY
    payload = {"receptionist_id": receptionist_id, "action": action, "params": params}
    last_err: Exception | None = None
    for attempt in range(RETRY_CALENDAR_COUNT + 1):
        try:
            async with httpx.AsyncClient(timeout=CALENDAR_API_TIMEOUT) as client:
                r = await client.post(url, json=payload, headers=headers or None)
                if r.status_code >= 500 and attempt < RETRY_CALENDAR_COUNT:
                    await asyncio.sleep(1.0)
                    continue
                return r.json()
        except (httpx.TimeoutException, httpx.ConnectError) as e:
            last_err = e
            if attempt < RETRY_CALENDAR_COUNT:
                await asyncio.sleep(1.0)
            else:
                logger.warning("Calendar API request failed after retries: %s", e)
                return {"success": False, "error": "request_failed", "message": str(e)}
        except Exception as e:
            logger.warning("Calendar API request failed: %s", e)
            return {"success": False, "error": "request_failed", "message": str(e)}
    return {"success": False, "error": "request_failed", "message": str(last_err)}


async def fetch_receptionist_prompt(receptionist_id: str) -> tuple[str, str]:
    """Fetch built prompt and greeting from Next.js API. Retries with backoff on failure.
    Returns (system_prompt, greeting)."""
    default_greeting = "Hello! Thanks for calling. I'm your AI receptionist. How can I help you today?"
    url = f"{PROMPT_API_BASE_URL.rstrip('/')}/api/receptionist-prompt?receptionist_id={receptionist_id}"
    headers = {}
    if VOICE_SERVER_API_KEY:
        headers["x-voice-server-key"] = VOICE_SERVER_API_KEY
    last_error: Exception | None = None
    for attempt in range(RETRY_PROMPT_COUNT + 1):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(url, headers=headers if headers else None)
                if r.status_code == 200:
                    data = r.json()
                    prompt = data.get("prompt", FALLBACK_PROMPT)
                    greeting = data.get("greeting", default_greeting) or default_greeting
                    return (prompt, greeting)
        except Exception as e:
            last_error = e
            logger.warning("Fetch prompt attempt %s failed: %s", attempt + 1, e)
        if attempt < RETRY_PROMPT_COUNT and attempt < len(RETRY_PROMPT_BACKOFF):
            await asyncio.sleep(RETRY_PROMPT_BACKOFF[attempt])
    if last_error:
        logger.warning("All prompt fetch retries failed, using fallback: %s", last_error)
    return (FALLBACK_PROMPT, default_greeting)


def transcribe(buffer: np.ndarray) -> tuple[str, float, float | None]:
    """
    Run Whisper on PCM buffer. Returns (text, max_no_speech_prob, min_avg_logprob).
    Use max_no_speech_prob and min_avg_logprob for STT confidence filtering.
    """
    if len(buffer) < 1000:
        return "", 0.0, None
    segments, _ = whisper_model.transcribe(buffer, language="en", beam_size=1)
    text = " ".join(s.text for s in segments).strip()
    no_speech_probs = [getattr(s, "no_speech_prob", 0.0) for s in segments]
    avg_logprobs = [getattr(s, "avg_logprob", 0.0) for s in segments if hasattr(s, "avg_logprob")]
    max_no_speech = max(no_speech_probs) if no_speech_probs else 0.0
    min_avg_logprob = min(avg_logprobs) if avg_logprobs else None
    return text, max_no_speech, min_avg_logprob


def _ollama_chat_sync(model: str, messages: list, tools: list | None = None) -> dict:
    """
    Synchronous Ollama chat (run in thread). Returns the message dict (content, tool_calls if any).
    Retries on connection/5xx-style errors with backoff.
    """
    import time as _time
    kwargs: dict = {"model": model, "messages": messages}
    if tools is not None:
        kwargs["tools"] = tools
    last_err: Exception | None = None
    for attempt in range(RETRY_LLM_COUNT + 1):
        try:
            response = ollama.chat(**kwargs)
            return response.get("message") or {}
        except Exception as e:
            last_err = e
            logger.warning("Ollama chat attempt %s failed: %s", attempt + 1, e)
            if attempt < RETRY_LLM_COUNT:
                _time.sleep(RETRY_LLM_BACKOFF)
    return {"content": "I'm having a quick technical moment. Could you say that again?", "tool_calls": []}


def llm_response(system_prompt: str, history: list, user_text: str) -> str:
    """Get reply from Ollama (no tools)."""
    messages = [{"role": "system", "content": system_prompt}]
    for msg in history:
        messages.append(msg)
    messages.append({"role": "user", "content": user_text})
    msg = _ollama_chat_sync(LLM_MODEL, messages, tools=None)
    return (msg.get("content") or "").strip()


def _parse_tool_from_content(content: str) -> tuple[str, dict] | None:
    """
    Fallback: some models return tool call as JSON in content, e.g.
    {"tool": "check_availability", "params": {"start_date": "2025-02-25"}}.
    Returns (tool_name, params) or None.
    """
    if not content or not content.strip().startswith("{"):
        return None
    try:
        data = json.loads(content.strip())
        if isinstance(data, dict):
            name = data.get("tool") or data.get("name") or data.get("function")
            params = data.get("params") or data.get("arguments") or {}
            if name and isinstance(params, dict):
                return (str(name), params)
    except (json.JSONDecodeError, TypeError):
        pass
    return None


async def llm_response_with_tools(
    system_prompt: str,
    history: list,
    user_text: str,
    receptionist_id: str | None,
) -> str:
    """
    Get reply from Ollama with optional calendar tool calling.
    If receptionist_id is set and tools are defined, runs up to MAX_TOOL_CALL_ROUNDS;
    each tool call is executed via the Next.js Calendar API, then Ollama is called again.
    Supports native tool_calls and fallback parsing of JSON tool call in content.
    """
    messages = [{"role": "system", "content": system_prompt}]
    for m in history:
        messages.append(m)
    messages.append({"role": "user", "content": user_text})

    use_tools = bool(receptionist_id and CALENDAR_TOOLS)
    content = ""
    for round_idx in range(MAX_TOOL_CALL_ROUNDS):
        tools = CALENDAR_TOOLS if (use_tools and round_idx == 0) else None
        msg = await asyncio.to_thread(_ollama_chat_sync, LLM_MODEL, messages, tools)
        content = (msg.get("content") or "").strip()
        tool_calls = msg.get("tool_calls") or []

        if not tool_calls:
            parsed = _parse_tool_from_content(content) if use_tools and receptionist_id else None
            if parsed:
                name, args = parsed
                if name in ("check_availability", "create_appointment", "reschedule_appointment"):
                    result = await call_calendar_api(receptionist_id, name, args)
                    messages.append({"role": "assistant", "content": content})
                    messages.append({"role": "user", "content": f"Tool result: {json.dumps(result)}"})
                    continue
            return content or "I'm sorry, I didn't get that. Could you repeat?"

        # Execute each tool call against the Calendar API
        results: list[dict] = []
        for tc in tool_calls:
            fn = tc.get("function") or {}
            name = fn.get("name") or ""
            args_str = fn.get("arguments") or "{}"
            try:
                args = json.loads(args_str) if isinstance(args_str, str) else args_str
            except (json.JSONDecodeError, TypeError):
                args = {}
            if receptionist_id and name in ("check_availability", "create_appointment", "reschedule_appointment"):
                result = await call_calendar_api(receptionist_id, name, args)
            else:
                result = {"success": False, "error": "unknown_tool", "message": f"Unknown tool: {name}"}
            results.append(result)

        # Append assistant message with tool_calls and tool results for next round
        messages.append({
            "role": "assistant",
            "content": content,
            "tool_calls": tool_calls,
        })
        for tc, result in zip(tool_calls, results):
            messages.append({
                "role": "tool",
                "content": json.dumps(result),
                "name": (tc.get("function") or {}).get("name") or "",
            })

    # Max rounds reached; get final reply from Ollama (no tools) so the model can summarize for the caller
    final_msg = await asyncio.to_thread(_ollama_chat_sync, LLM_MODEL, messages, None)
    return (final_msg.get("content") or "").strip() or "I've updated the calendar. Is there anything else?"


def synthesize_speech(text: str) -> tuple[np.ndarray, int]:
    """TTS with Piper. Returns (audio_float32, sample_rate)."""
    chunks = list(piper_voice.synthesize(text))
    if not chunks:
        return np.array([], dtype=np.float32), 22050
    audio = np.concatenate([c.audio_float_array for c in chunks])
    sr = chunks[0].sample_rate
    return audio, sr


async def handle_connection(websocket):
    """Handle one Twilio Media Stream WebSocket connection. Uses per-call memory keyed by stream_sid."""
    stream_sid: str | None = None
    receptionist_id: str | None = None
    system_prompt = FALLBACK_PROMPT
    greeting = "Hello! Thanks for calling. I'm your AI receptionist. How can I help you today?"
    state: CallState | None = None
    audio_buffer = np.array([], dtype=np.float32)
    last_speech_time = time.time()
    is_speaking = False
    use_short_silence = False  # After we send TTS, use shorter silence window for next turn

    try:
        async for raw in websocket:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            event = msg.get("event")
            if event == "connected":
                logger.info("Connected")
                continue
            if event == "start":
                start = msg.get("start", {})
                stream_sid = start.get("streamSid") or msg.get("streamSid") or ""
                params = start.get("customParameters", {})
                receptionist_id = params.get("receptionist_id")
                call_sid = params.get("call_sid")
                caller_phone = params.get("caller_phone")
                state = CallState(
                    stream_sid=stream_sid,
                    receptionist_id=receptionist_id,
                    call_sid=call_sid,
                    caller_phone=caller_phone,
                )
                call_memory[stream_sid] = state
                if receptionist_id:
                    system_prompt, greeting = await fetch_receptionist_prompt(receptionist_id)
                logger.info(
                    "Start stream_sid=%s receptionist_id=%s call_sid=%s caller=%s",
                    stream_sid, receptionist_id, call_sid, caller_phone or "unknown",
                )
                # Play greeting (run TTS off event loop to avoid blocking)
                audio, sr = await asyncio.to_thread(synthesize_speech, greeting)
                if len(audio) > 0:
                    payload_b64 = pcm_to_mulaw(audio, sample_rate=sr)
                    await websocket.send(json.dumps({
                        "event": "media",
                        "streamSid": stream_sid,
                        "media": {"payload": payload_b64},
                    }))
                continue
            if event == "stop":
                logger.info("Stop stream_sid=%s", stream_sid)
                break
            if event == "media":
                if state is None:
                    continue
                media = msg.get("media", {})
                track = media.get("track", "")
                if track != "inbound":
                    continue
                payload = media.get("payload", "")
                if not payload or is_speaking:
                    continue
                pcm = mulaw_to_pcm(payload)
                resampled = resample_pcm(pcm, TWILIO_SAMPLE_RATE, SAMPLE_RATE)
                audio_buffer = np.concatenate([audio_buffer, resampled]) if len(audio_buffer) > 0 else resampled

                # VAD: check last 30ms frame
                frame_samples = int(SAMPLE_RATE * VAD_FRAME_MS / 1000)
                if len(audio_buffer) >= frame_samples:
                    frame = audio_buffer[-frame_samples:]
                    frame_bytes = (frame * 32767).astype(np.int16).tobytes()
                    is_speech = vad.is_speech(frame_bytes, SAMPLE_RATE)
                    if is_speech:
                        last_speech_time = time.time()
                        use_short_silence = False
                    else:
                        effective_silence = (
                            SILENCE_TIMEOUT_AFTER_PLAYBACK if use_short_silence else SILENCE_TIMEOUT
                        )
                        if time.time() - last_speech_time > effective_silence and len(audio_buffer) > SAMPLE_RATE:
                            text, max_no_speech, min_avg_logprob = await asyncio.to_thread(
                                transcribe, audio_buffer
                            )
                            audio_buffer = np.array([], dtype=np.float32)
                            use_short_silence = False
                            if not text:
                                last_speech_time = time.time()
                                continue
                            if max_no_speech > STT_NO_SPEECH_PROB_THRESHOLD or (
                                min_avg_logprob is not None and min_avg_logprob < STT_MIN_AVG_LOGPROB
                            ):
                                logger.info(
                                    "STT low confidence (no_speech=%.2f logprob=%s), asking to repeat",
                                    max_no_speech, min_avg_logprob,
                                )
                                # Send fallback TTS instead of staying silent (better UX)
                                is_speaking = True
                                try:
                                    audio, sr = await asyncio.to_thread(
                                        synthesize_speech, STT_LOW_CONFIDENCE_RESPONSE
                                    )
                                    if len(audio) > 0 and stream_sid:
                                        payload_b64 = pcm_to_mulaw(audio, sample_rate=sr)
                                        await websocket.send(json.dumps({
                                            "event": "media",
                                            "streamSid": stream_sid,
                                            "media": {"payload": payload_b64},
                                        }))
                                    use_short_silence = True
                                finally:
                                    is_speaking = False
                                    last_speech_time = time.time()
                                continue
                            speech_end_t = time.time()
                            logger.info(
                                "timing stream_sid=%s speech_end=%.3f",
                                stream_sid, speech_end_t,
                            )
                            logger.info("User: %s", text)
                            is_speaking = True
                            llm_start_t = time.time()
                            try:
                                reply = await llm_response_with_tools(
                                    system_prompt, state.conversation_history, text, receptionist_id
                                )
                                llm_end_t = time.time()
                                logger.info(
                                    "timing stream_sid=%s llm_start=%.3f llm_end=%.3f llm_ms=%.0f",
                                    stream_sid, llm_start_t, llm_end_t, (llm_end_t - llm_start_t) * 1000,
                                )
                                logger.info("AI: %s", reply)
                                state.conversation_history.append({"role": "user", "content": text})
                                state.conversation_history.append({"role": "assistant", "content": reply})
                                if len(state.conversation_history) > MAX_HISTORY_MESSAGES:
                                    state.conversation_history = state.conversation_history[-MAX_HISTORY_MESSAGES:]

                                audio, sr = await asyncio.to_thread(synthesize_speech, reply)
                                tts_end_t = time.time()
                                logger.info(
                                    "timing stream_sid=%s tts_end=%.3f total_latency_ms=%.0f",
                                    stream_sid, tts_end_t,
                                    (tts_end_t - speech_end_t) * 1000,
                                )
                                if len(audio) > 0 and stream_sid:
                                    payload_b64 = pcm_to_mulaw(audio, sample_rate=sr)
                                    await websocket.send(json.dumps({
                                        "event": "media",
                                        "streamSid": stream_sid,
                                        "media": {"payload": payload_b64},
                                    }))
                                use_short_silence = True
                            finally:
                                is_speaking = False
                                last_speech_time = time.time()

    except websockets.exceptions.ConnectionClosed:
        logger.info("Connection closed stream_sid=%s", stream_sid)
    except Exception as e:
        logger.exception("Error in connection: %s", e)
    finally:
        if stream_sid and stream_sid in call_memory:
            state = call_memory.get(stream_sid)
            if state and state.conversation_history:
                transcript_lines = []
                for m in state.conversation_history:
                    role = m.get("role", "unknown")
                    content = (m.get("content") or "").strip()
                    if content:
                        transcript_lines.append(f"{role}: {content}")
                if transcript_lines:
                    logger.info(
                        "call_transcript stream_sid=%s call_sid=%s caller=%s turns=%d\n%s",
                        stream_sid,
                        state.call_sid or "",
                        state.caller_phone or "unknown",
                        len(transcript_lines),
                        "\n".join(transcript_lines),
                    )
            del call_memory[stream_sid]
            logger.debug("Cleaned call_memory for stream_sid=%s", stream_sid)


async def main():
    logger.info("Starting voice server on %s:%s", WS_HOST, WS_PORT)
    async with websockets.serve(
        handle_connection,
        WS_HOST,
        WS_PORT,
        ping_interval=20,
        ping_timeout=60,
    ):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
