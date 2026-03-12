# Architecture

High-level diagram and explanation of app-first architecture: Flutter + Python backend + minimal Next.js.

## Overview

Callbot/Echodesk is an AI phone receptionist with an **app-first architecture**:

```
User → Flutter app (primary) or static website (landing, download links)
Phone call → Telnyx → Python backend (webhook + WebSocket) → Deepgram/Grok/ElevenLabs → Telnyx → Caller
```

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Nginx (echodesk.us:443)                            │
│  /api/telnyx/*, /api/voice/* → Python:8000  |  /, /api/stripe,cron,mobile → Next.js:3000 │
└─────────────────────────────────────────────────────────────────────────────┘
        │                                                      │
        ▼                                                      ▼
┌───────────────────────┐                          ┌───────────────────────┐
│  Python backend :8000 │                          │  Next.js :3000        │
│  - /api/telnyx/voice  │◄──── Telnyx ───────────►│  - Landing page       │
│  - /api/telnyx/cdr    │     webhook + WS        │  - /api/stripe/*      │
│  - /api/telnyx/outbound│                         │  - /api/cron/*        │
│  - /api/voice/stream  │                          │  - /api/mobile/*      │
│  - Quota, FCM push    │                          │  - /api/google/callback│
│  - Deepgram/Grok/EL   │                          └───────────┬───────────┘
└───────────┬───────────┘                                      │
            │                                                   │
            └──────────────────────┬────────────────────────────┘
                                   ▼
                         ┌─────────────────┐
                         │ Supabase, Stripe│
                         └─────────────────┘
```

## Data Flow

### Incoming call

1. Caller dials DID → **Telnyx** receives call
2. Telnyx sends `POST /api/telnyx/voice` (call.initiated) → **Python backend**
3. Backend: lookup receptionist, **local quota check**, FCM push, answer call, `stream_start(stream_url)`
4. Telnyx connects WebSocket to `wss://echodesk.us/api/voice/stream` → **Python backend**
5. Backend: Deepgram STT → Grok LLM → ElevenLabs TTS → audio back to Telnyx
6. On hangup: Telnyx → `POST /api/telnyx/cdr` → **Python backend** (usage, call_ended push)

### Outbound call

1. Flutter app → `POST /api/telnyx/outbound` → **Python backend** (via nginx)
2. Python → Telnyx `create_call` with `webhookUrl: .../api/telnyx/voice`
3. Telnyx → **Python backend** (same flow as inbound)

### Critical path

- `/api/telnyx/voice`, `/api/telnyx/cdr`, `/api/telnyx/outbound`, `/api/voice/*` → **Python** (port 8000)
- `/`, `/api/stripe/*`, `/api/cron/*`, `/api/mobile/*`, `/api/google/*`, `/api/health` → **Next.js** (port 3000)
- Nginx routes voice/telnyx paths to Python **before** the catch-all `/`

**Troubleshooting:** If incoming calls are not answered, see [CALL_FLOW_DIAGNOSTIC.md](CALL_FLOW_DIAGNOSTIC.md) and run `./deploy/scripts/diagnose-call-flow.sh` on the VPS.
