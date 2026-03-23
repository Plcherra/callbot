#!/usr/bin/env python3
"""
Smoke test for Google Cloud TTS.
Synthesizes a short MP3 to artifacts/google-tts-smoke.mp3.
Run from project root: python scripts/smoke-google-tts.py

Exits 0 on success, non-zero with actionable error on auth/config failure.
"""

import asyncio
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
backend = root / "backend"
sys.path.insert(0, str(backend))

# Load .env
_env = root / ".env"
_env_local = root / ".env.local"
if _env.exists():
    from dotenv import load_dotenv
    load_dotenv(_env)
if _env_local.exists():
    from dotenv import load_dotenv
    load_dotenv(_env_local)


async def main() -> int:
    from config import settings
    from voice_presets import DEFAULT_PRESET_KEY, resolve_tts_voice
    from voice.tts_facade import google_preview_mp3

    tts_provider = (settings.tts_provider or "google").strip().lower()
    if tts_provider != "google":
        print(
            "smoke-google-tts.py: TTS_PROVIDER must be 'google'. "
            f"Current: {tts_provider}",
            file=sys.stderr,
        )
        return 1

    try:
        voice = resolve_tts_voice(DEFAULT_PRESET_KEY, None)
        text = "Hello, this is a faster Google TTS smoke test. Morning and afternoon slots are available."
        audio_bytes = await google_preview_mp3(text, voice)
    except Exception as e:
        print("smoke-google-tts.py: Google TTS failed:", e, file=sys.stderr)
        print(
            "\nRemediation: Run `gcloud auth application-default login` "
            "or set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json",
            file=sys.stderr,
        )
        return 1

    out_dir = root / "artifacts"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "google-tts-smoke.mp3"
    out_path.write_bytes(audio_bytes)
    print(f"smoke-google-tts.py: OK – wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
