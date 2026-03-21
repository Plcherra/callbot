# Voice AI Setup (Deepgram, TTS, Grok)

This document describes the voice pipeline: Telnyx + Deepgram STT + Grok LLM + **ElevenLabs** or **Google Cloud Text-to-Speech** TTS.

## Overview

- **Phone numbers**: Telnyx provisions and manages DIDs
- **Call handling**: Telnyx webhooks route incoming calls; **Python FastAPI backend** answers and streams to WebSocket
- **AI pipeline**: Deepgram (STT) → Grok (LLM) → TTS (ElevenLabs or Google Cloud) — all via external APIs
- **Prompts**: Built from Supabase data, fetched by the Python backend

## Prerequisites

- Telnyx account (portal.telnyx.com)
- Deepgram API key (console.deepgram.com)
- **Either** ElevenLabs API key (elevenlabs.io) **or** Google Cloud project with Text-to-Speech API enabled and credentials (ADC or service account JSON)
- Grok API key (x.ai/developer)
- Next.js app deployed (dashboard)
- Python voice backend (FastAPI/uvicorn on port 8000)

## Environment Variables

Set in project root `.env` or `.env.local` (both Next.js and Python backend read from here):

```env
# Telnyx
TELNYX_API_KEY=
TELNYX_WEBHOOK_BASE_URL=https://echodesk.us

# Voice AI (used by Python backend)
DEEPGRAM_API_KEY=
GROK_API_KEY=
# TTS: elevenlabs (default) or google
TTS_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
# Google Cloud TTS (when TTS_PROVIDER=google): use ADC or GOOGLE_APPLICATION_CREDENTIALS
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
# GOOGLE_TTS_DEFAULT_VOICE_NAME=en-US-Neural2-F
# GOOGLE_TTS_BACKUP_VOICE_NAME=en-US-Neural2-C
# Optional: TTS_CACHE_BACKEND=memory  TTS_CACHE_FILESYSTEM_DIR=/var/cache/tts

# Auth for prompt/calendar APIs
VOICE_SERVER_API_KEY=optional_secret

# Backend → Next.js internal APIs (FCM push, quota check)
APP_API_BASE_URL=https://echodesk.us
INTERNAL_API_KEY=shared_secret
```

## Running the App

**Production (PM2):**

```bash
npm run build
pm2 start ecosystem.config.cjs
```

This starts both `callbot` (Next.js on 3000) and `callbot-voice` (Python on 8000).

**Local development:**

```bash
# Terminal 1: Next.js dashboard
npm run dev

# Terminal 2: Python voice backend
cd backend && uvicorn main:app --reload --port 8000
```

Expose with ngrok or Cloudflare Tunnel. Set `TELNYX_WEBHOOK_BASE_URL` to your public URL.

## Audio Format

| Direction | Telnyx | Pipeline |
|-----------|--------|----------|
| Inbound   | mulaw 8kHz | Deepgram (mulaw 8kHz) → transcript |
| Outbound  | mulaw 8kHz | ElevenLabs (`ulaw_8000`) or Google (`MULAW` 8 kHz) → Telnyx |

Operational notes for Google TTS (quotas, IAM, 429s): [runbooks/google-tts.md](runbooks/google-tts.md).

## Troubleshooting

- **No audio**: Verify DEEPGRAM_API_KEY, GROK_API_KEY, and either `ELEVENLABS_API_KEY` (ElevenLabs) or Google credentials (`TTS_PROVIDER=google`)
- **WebSocket not connecting**: Ensure callbot-voice is running on 8000; nginx proxies /api/voice/* to 8000 with Upgrade headers
- **Prompt not loading**: Verify VOICE_SERVER_API_KEY; backend fetches from Supabase directly
- **Call usage not recorded**: Configure Telnyx CDR webhook to `https://echodesk.us/api/telnyx/cdr` (Next.js)

See [VOICE_DEBUG.md](VOICE_DEBUG.md) for detailed troubleshooting.
