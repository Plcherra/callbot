"""Voice pipeline constants."""

import os

# 160 bytes of 0xff - mulaw silence for telephony
SILENCE_PACKET = bytes([0xFF] * 160)
SILENCE_INTERVAL_MS = 3000
PING_INTERVAL_MS = 3000


def get_prompt_base() -> str:
    port = os.environ.get("PORT", "8000")
    return os.environ.get("VOICE_PROMPT_BASE_URL", f"http://127.0.0.1:{port}")


def get_voice_api_key() -> str:
    return os.environ.get("VOICE_SERVER_API_KEY", "")
