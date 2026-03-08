"""ElevenLabs TTS via httpx."""

import httpx

ELEVENLABS_API = "https://api.elevenlabs.io/v1"


async def text_to_speech(
    text: str,
    voice_id: str,
    api_key: str,
    model_id: str = "eleven_multilingual_v2",
    output_format: str = "ulaw_8000",
) -> bytes:
    """Convert text to speech, return audio bytes (mulaw 8kHz for telephony)."""
    url = f"{ELEVENLABS_API}/text-to-speech/{voice_id}?output_format={output_format}"
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
