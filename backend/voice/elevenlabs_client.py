"""ElevenLabs TTS via httpx."""

import logging
from collections.abc import AsyncIterator

import httpx

ELEVENLABS_API = "https://api.elevenlabs.io/v1"

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "eleven_flash_v2_5"


async def text_to_speech(
    text: str,
    voice_id: str,
    api_key: str,
    model_id: str = DEFAULT_MODEL,
    output_format: str = "ulaw_8000",
) -> bytes:
    """Convert text to speech, return audio bytes (mulaw 8kHz for telephony)."""
    url = f"{ELEVENLABS_API}/text-to-speech/{voice_id}?output_format={output_format}"

    logger.info(
        "[ElevenLabs TTS] voice_id=%s model_id=%s endpoint=%s output_format=%s api_key_present=%s",
        voice_id,
        model_id,
        url,
        output_format,
        bool(api_key and api_key.strip()),
    )
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            url,
            headers={
                "xi-api-key": api_key,
                "Content-Type": "application/json",
                "Accept": "audio/basic",
            },
            json={"text": text, "model_id": model_id},
        )
        resp.raise_for_status()
        return resp.content


async def text_to_speech_stream(
    text: str,
    voice_id: str,
    api_key: str,
    model_id: str = DEFAULT_MODEL,
    output_format: str = "ulaw_8000",
    optimize_streaming_latency: int = 3,
) -> AsyncIterator[bytes]:
    """Stream text to speech as chunks (mulaw 8kHz for telephony).
    Yields audio chunks as they arrive for lower latency.
    """
    url = (
        f"{ELEVENLABS_API}/text-to-speech/{voice_id}/stream"
        f"?output_format={output_format}&optimize_streaming_latency={optimize_streaming_latency}"
    )

    logger.info(
        "[ElevenLabs TTS stream] voice_id=%s model_id=%s output_format=%s api_key_present=%s",
        voice_id,
        model_id,
        output_format,
        bool(api_key and api_key.strip()),
    )
    async with httpx.AsyncClient(timeout=30.0) as client:
        async with client.stream(
            "POST",
            url,
            headers={
                "xi-api-key": api_key,
                "Content-Type": "application/json",
                "Accept": "audio/basic",
            },
            json={"text": text, "model_id": model_id},
        ) as resp:
            resp.raise_for_status()
            async for chunk in resp.aiter_bytes(chunk_size=1024):
                if chunk:
                    yield chunk
