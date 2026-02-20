"""
Twilio Media Streams WebSocket server for self-hosted voice AI.
Receives inbound audio from Twilio, runs Whisper → Ollama → Piper, sends TTS back.
Run from project root: python voice-ai/call_server.py
"""
import asyncio
import json
import logging
import time
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
    LLM_MODEL,
    PROMPT_API_BASE_URL,
    SILENCE_TIMEOUT,
    VAD_AGGRESSIVENESS,
    VOICE_PATH,
    VOICE_SERVER_API_KEY,
    WHISPER_MODEL,
    WS_HOST,
    WS_PORT,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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


async def fetch_receptionist_prompt(receptionist_id: str) -> str:
    """Fetch built prompt from Next.js API."""
    url = f"{PROMPT_API_BASE_URL.rstrip('/')}/api/receptionist-prompt?receptionist_id={receptionist_id}"
    headers = {}
    if VOICE_SERVER_API_KEY:
        headers["x-voice-server-key"] = VOICE_SERVER_API_KEY
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url, headers=headers if headers else None)
            if r.status_code == 200:
                data = r.json()
                return data.get("prompt", FALLBACK_PROMPT)
    except Exception as e:
        logger.warning("Failed to fetch prompt: %s", e)
    return FALLBACK_PROMPT


def transcribe(buffer: np.ndarray) -> str:
    """Run Whisper on PCM buffer."""
    if len(buffer) < 1000:
        return ""
    segments, _ = whisper_model.transcribe(buffer, language="en", beam_size=1)
    return " ".join(s.text for s in segments).strip()


def llm_response(system_prompt: str, history: list, user_text: str) -> str:
    """Get reply from Ollama."""
    messages = [{"role": "system", "content": system_prompt}]
    for msg in history:
        messages.append(msg)
    messages.append({"role": "user", "content": user_text})
    response = ollama.chat(model=LLM_MODEL, messages=messages)
    return response["message"]["content"].strip()


def synthesize_speech(text: str) -> tuple[np.ndarray, int]:
    """TTS with Piper. Returns (audio_float32, sample_rate)."""
    chunks = list(piper_voice.synthesize(text))
    if not chunks:
        return np.array([], dtype=np.float32), 22050
    audio = np.concatenate([c.audio_float_array for c in chunks])
    sr = chunks[0].sample_rate
    return audio, sr


async def handle_connection(websocket):
    """Handle one Twilio Media Stream WebSocket connection."""
    stream_sid = None
    receptionist_id = None
    system_prompt = FALLBACK_PROMPT
    conversation_history: list[dict] = []
    audio_buffer = np.array([], dtype=np.float32)
    last_speech_time = time.time()
    is_speaking = False

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
                stream_sid = start.get("streamSid") or msg.get("streamSid")
                params = start.get("customParameters", {})
                receptionist_id = params.get("receptionist_id")
                if receptionist_id:
                    system_prompt = await fetch_receptionist_prompt(receptionist_id)
                logger.info("Start stream_sid=%s receptionist_id=%s", stream_sid, receptionist_id)
                # Play greeting
                greeting = "Hello! Thanks for calling. I'm your AI receptionist. How can I help you today?"
                audio, sr = synthesize_speech(greeting)
                if len(audio) > 0:
                    payload_b64 = pcm_to_mulaw(audio, sample_rate=sr)
                    await websocket.send(json.dumps({
                        "event": "media",
                        "streamSid": stream_sid,
                        "media": {"payload": payload_b64},
                    }))
                continue
            if event == "stop":
                logger.info("Stop")
                break
            if event == "media":
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
                    elif time.time() - last_speech_time > SILENCE_TIMEOUT and len(audio_buffer) > SAMPLE_RATE:
                        text = transcribe(audio_buffer)
                        audio_buffer = np.array([], dtype=np.float32)
                        if text:
                            logger.info("User: %s", text)
                            is_speaking = True
                            try:
                                reply = llm_response(system_prompt, conversation_history, text)
                                logger.info("AI: %s", reply)
                                conversation_history.append({"role": "user", "content": text})
                                conversation_history.append({"role": "assistant", "content": reply})
                                if len(conversation_history) > 6:
                                    conversation_history = conversation_history[-6:]

                                audio, sr = synthesize_speech(reply)
                                if len(audio) > 0 and stream_sid:
                                    payload_b64 = pcm_to_mulaw(audio, sample_rate=sr)
                                    await websocket.send(json.dumps({
                                        "event": "media",
                                        "streamSid": stream_sid,
                                        "media": {"payload": payload_b64},
                                    }))
                            finally:
                                is_speaking = False
                                last_speech_time = time.time()

    except websockets.exceptions.ConnectionClosed:
        logger.info("Connection closed")
    except Exception as e:
        logger.exception("Error in connection: %s", e)


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
