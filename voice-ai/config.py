"""
Configuration for the voice call server.
"""
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
VOICE_PATH = PROJECT_ROOT / "en_US-lessac-medium.onnx"

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
PROMPT_API_BASE_URL = os.environ.get("PROMPT_API_BASE_URL", "http://localhost:3000")
CALENDAR_API_BASE_URL = os.environ.get("CALENDAR_API_BASE_URL", "").strip() or None  # None = use PROMPT_API_BASE_URL
VOICE_SERVER_API_KEY = os.environ.get("VOICE_SERVER_API_KEY", "")
CALENDAR_API_TIMEOUT = float(os.environ.get("CALENDAR_API_TIMEOUT", "15"))
MAX_TOOL_CALL_ROUNDS = int(os.environ.get("MAX_TOOL_CALL_ROUNDS", "2"))

WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "tiny.en")
LLM_MODEL = os.environ.get("LLM_MODEL", "llama3.1:8b")
VAD_AGGRESSIVENESS = int(os.environ.get("VAD_AGGRESSIVENESS", "3"))
SILENCE_TIMEOUT = float(os.environ.get("SILENCE_TIMEOUT", "0.9"))
# Shorter silence window after we finish TTS so the next user turn is detected sooner
SILENCE_TIMEOUT_AFTER_PLAYBACK = float(os.environ.get("SILENCE_TIMEOUT_AFTER_PLAYBACK", "0.4"))
WS_HOST = os.environ.get("WS_HOST", "0.0.0.0")
WS_PORT = int(os.environ.get("WS_PORT", "8765"))

# STT confidence: reject utterance if no_speech_prob or logprob outside range (reduces hallucinations from noise)
STT_NO_SPEECH_PROB_THRESHOLD = float(os.environ.get("STT_NO_SPEECH_PROB_THRESHOLD", "0.6"))
STT_MIN_AVG_LOGPROB = float(os.environ.get("STT_MIN_AVG_LOGPROB", "-1.0"))

# Retries (count = number of retries after first attempt, so 2 = 3 total attempts)
RETRY_PROMPT_COUNT = int(os.environ.get("RETRY_PROMPT_COUNT", "2"))
RETRY_PROMPT_BACKOFF = [1.0, 2.0]  # seconds
RETRY_LLM_COUNT = int(os.environ.get("RETRY_LLM_COUNT", "2"))
RETRY_LLM_BACKOFF = 1.0
RETRY_CALENDAR_COUNT = int(os.environ.get("RETRY_CALENDAR_COUNT", "1"))

# Optional: when True, future barge-in can stop TTS when user speaks over (not implemented in full yet)
BARGE_IN_ENABLED = os.environ.get("BARGE_IN_ENABLED", "").lower() in ("1", "true", "yes")
