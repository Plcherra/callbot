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
VOICE_SERVER_API_KEY = os.environ.get("VOICE_SERVER_API_KEY", "")

WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "tiny.en")
LLM_MODEL = os.environ.get("LLM_MODEL", "llama3.1:8b")
VAD_AGGRESSIVENESS = int(os.environ.get("VAD_AGGRESSIVENESS", "3"))
SILENCE_TIMEOUT = float(os.environ.get("SILENCE_TIMEOUT", "0.9"))
WS_HOST = os.environ.get("WS_HOST", "0.0.0.0")
WS_PORT = int(os.environ.get("WS_PORT", "8765"))
