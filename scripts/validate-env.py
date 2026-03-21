#!/usr/bin/env python3
"""
Validate Python backend environment variables.
Run from project root: python scripts/validate-env.py

Uses backend config (loads .env from project root), exits 1 on failure.
"""

import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
backend = root / "backend"
sys.path.insert(0, str(backend))

from config import settings


def main() -> int:
    errors: list[str] = []

    # Voice keys (required for backend startup)
    if not (settings.deepgram_api_key or "").strip():
        errors.append("DEEPGRAM_API_KEY")
    if not (settings.grok_api_key or "").strip():
        errors.append("GROK_API_KEY")
    tts_provider = (settings.tts_provider or "elevenlabs").strip().lower()
    if tts_provider == "elevenlabs" and not (settings.elevenlabs_api_key or "").strip():
        errors.append("ELEVENLABS_API_KEY")

    # Supabase
    url = settings.get_supabase_url()
    key = (settings.supabase_service_role_key or "").strip()
    if not url or not key:
        errors.append("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY")

    # Telnyx
    if not (settings.telnyx_api_key or "").strip():
        errors.append("TELNYX_API_KEY")

    if errors:
        print("validate-env.py: Missing required environment variables:", file=sys.stderr)
        for e in errors:
            print("  -", e, file=sys.stderr)
        print("\nCopy deploy/env/.env.example to .env.local and fill in values.", file=sys.stderr)
        return 1

    # Run config validators
    try:
        settings.validate_voice_keys()
        settings.validate_supabase()
        settings.validate_telnyx()
    except ValueError as e:
        print("validate-env.py:", e, file=sys.stderr)
        return 1

    print("validate-env.py: OK – all required backend env vars present")
    return 0


if __name__ == "__main__":
    sys.exit(main())
