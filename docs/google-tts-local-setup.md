# Google TTS Local Setup (Cursor)

This guide covers local development setup for Google Cloud Text-to-Speech in Cursor.

## Prerequisites

- Python 3.9+ with `google-cloud-texttospeech` installed (see `backend/requirements.txt`)
- Google Cloud project with [Cloud Text-to-Speech API](https://console.cloud.google.com/apis/library/texttospeech.googleapis.com) enabled

## 1. Application Default Credentials (ADC)

For local Cursor development, ADC is the simplest option.

1. Install the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (if not already):
   ```bash
   brew install --cask google-cloud-sdk
   ```

2. Authenticate:
   ```bash
   gcloud auth application-default login
   ```
   This opens a browser, signs you in, and stores credentials at `~/.config/gcloud/application_default_credentials.json`. The backend uses these automatically.

3. Ensure the correct project is active:
   ```bash
   gcloud config get-value project
   gcloud config set project YOUR_PROJECT_ID   # if needed
   ```

## 2. Service Account File (alternative)

When ADC is not available (e.g. CI, VPS), use a service account JSON file:

1. In [Google Cloud Console](https://console.cloud.google.com/) → IAM & Admin → Service Accounts, create a service account with **Cloud Text-to-Speech User** (`roles/cloudtts.user`).
2. Create a JSON key and save it somewhere safe (never commit to git).
3. Set the environment variable:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/your-service-account.json
   ```
   Or add to `.env.local`:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/Users/you/path/to/service-account.json
   ```

## 3. Enable Google TTS in Your Env

Set `TTS_PROVIDER=google` in `.env` or `.env.local`:

```
TTS_PROVIDER=google
```

Optional overrides (see `backend/.env.example`):

```
GOOGLE_TTS_DEFAULT_VOICE_NAME=en-US-Neural2-F
GOOGLE_TTS_BACKUP_VOICE_NAME=en-US-Neural2-C
GOOGLE_TTS_SPEAKING_RATE=1.0
GOOGLE_TTS_PITCH=0.0
```

## 4. Validate Setup

Run the validation script:

```bash
python scripts/validate-env.py
```

On success: `validate-env.py: OK – all required backend env vars present`.

If Google credentials are missing, you’ll see remediation steps:

```
Remediation for local Cursor development:
  1. gcloud auth application-default login
  2. Or set GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

## 5. Smoke Test

Synthesize a short MP3 to verify the full pipeline:

```bash
python scripts/smoke-google-tts.py
```

On success: `smoke-google-tts.py: OK – wrote artifacts/google-tts-smoke.mp3`.  
You can play the file to confirm audio quality.

## 6. Switching Between ElevenLabs and Google

Change `TTS_PROVIDER` in `.env` or `.env.local`:

- `TTS_PROVIDER=elevenlabs` — uses ElevenLabs (requires `ELEVENLABS_API_KEY`)
- `TTS_PROVIDER=google` — uses Google Cloud TTS (requires ADC or `GOOGLE_APPLICATION_CREDENTIALS`)

Restart the backend after changing.

## Operations

For quotas, IAM, 429 handling, and billing: [runbooks/google-tts.md](runbooks/google-tts.md).
