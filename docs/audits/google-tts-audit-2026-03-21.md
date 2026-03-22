# Google TTS Audit Changelog — 2026-03-21

Summary of changes implemented to improve Google Cloud TTS readiness for local Cursor development and production operations.

## 1. Google credential preflight at startup

- **File:** `backend/voice/google_credentials.py` (new)
- **Integration:** `backend/main.py` lifespan
- When `TTS_PROVIDER=google`, the backend verifies credentials before startup:
  - If `GOOGLE_APPLICATION_CREDENTIALS` is set: checks that the file exists and is readable
  - Otherwise: uses `google.auth.default()` to detect ADC (e.g. from `gcloud auth application-default login`)
- Fails fast with an actionable error message if credentials are missing or invalid
- No blocking network synth call on startup

## 2. validate-env.py Google auth check

- **File:** `scripts/validate-env.py`
- When `TTS_PROVIDER=google`, runs the same credential preflight
- On failure, prints remediation steps:
  - `gcloud auth application-default login`
  - `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json`

## 3. .env.example expansion

- **Files:** `backend/.env.example`, `deploy/env/.env.example`
- Added commented Google TTS variables:
  - `GOOGLE_APPLICATION_CREDENTIALS`
  - `GOOGLE_TTS_DEFAULT_LANGUAGE_CODE`
  - `GOOGLE_TTS_DEFAULT_VOICE_NAME`
  - `GOOGLE_TTS_BACKUP_VOICE_NAME`
  - `GOOGLE_TTS_ALLOW_PREMIUM_TIERS`
  - `GOOGLE_TTS_SPEAKING_RATE`
  - `GOOGLE_TTS_PITCH`
  - `TTS_CACHE_BACKEND`
  - `TTS_CACHE_FILESYSTEM_DIR`
  - `TTS_GOOGLE_MAX_RETRIES`

## 4. Smoke test script

- **File:** `scripts/smoke-google-tts.py` (new)
- Loads project env, requires `TTS_PROVIDER=google`
- Uses existing `google_preview_mp3()` to synthesize a short MP3
- Writes output to `artifacts/google-tts-smoke.mp3`
- Exits non-zero with remediation message on auth/config failure

## 5. Local setup documentation

- **File:** `docs/google-tts-local-setup.md` (new)
- Exact local setup in Cursor
- How ADC works (`gcloud auth application-default login`)
- How to use a service account file
- How to run the smoke test
- How to switch between ElevenLabs and Google

## 6. Health endpoint tts_google field

- **File:** `backend/main.py`
- When `TTS_PROVIDER=google`, `/health` and `/api/health` include `tts_google`:
  - `configured`: credentials available
  - `missing_credentials`: no credentials found
  - `auth_failed`: credentials found but invalid
- Non-invasive; no synth call for health checks
