"""Voice pipeline constants."""

from config import settings

# 160 bytes of 0xff - mulaw silence for telephony
SILENCE_PACKET = bytes([0xFF] * 160)
SILENCE_INTERVAL_MS = 3000
PING_INTERVAL_MS = 3000


def get_prompt_base() -> str:
    """URL for voice backend to fetch prompts from Next.js. Uses config (VOICE_PROMPT_BASE_URL)."""
    base = (settings.voice_prompt_base_url or "").strip()
    if base:
        return base.rstrip("/")
    port = getattr(settings, "port", 8000)
    return f"http://127.0.0.1:{port}"


def get_voice_api_key() -> str:
    """API key for auth with Next.js prompt/calendar APIs."""
    return (settings.voice_server_api_key or "").strip()
