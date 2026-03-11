# Architecture

High-level diagram and explanation of web ↔ backend ↔ Telnyx flow.

## Overview

Callbot is an AI phone receptionist. The **intended chain** is:

```
User (web/mobile) → Next.js (dashboard, API) → Supabase/Stripe
Phone call → Telnyx → Python backend (webhook + WebSocket) → Deepgram/Grok/ElevenLabs → Telnyx → Caller
```

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Nginx (echodesk.us:443)                        │
│  /api/telnyx/voice, /api/voice/* → backend:8000  |  / → Next.js:3000    │
└─────────────────────────────────────────────────────────────────────────┘
        │                                              │
        ▼                                              ▼
┌───────────────────────┐                  ┌───────────────────────┐
│  Python backend :8000 │                  │  Next.js :3000        │
│  - /api/telnyx/voice  │◄───Telnyx───────►│  - Dashboard, pages   │
│  - /api/voice/stream  │   webhook + WS   │  - /api/telnyx/outbound│
│  - Deepgram/Grok/EL   │                  │  - /api/telnyx/cdr    │
└───────────┬───────────┘                  │  - /api/internal/*    │
            │                              └───────────┬───────────┘
            │  FCM push, quota check                   │
            └──────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Supabase, Stripe│
                    └─────────────────┘
```

## Data Flow

### Incoming call

1. Caller dials DID → **Telnyx** receives call
2. Telnyx sends `POST /api/telnyx/voice` (call.initiated) → **Python backend**
3. Backend: lookup receptionist, quota check via Next.js, FCM push, answer call, `stream_start(stream_url)`
4. Telnyx connects WebSocket to `wss://echodesk.us/api/voice/stream` → **Python backend**
5. Backend: Deepgram STT → Grok LLM → ElevenLabs TTS → audio back to Telnyx
6. On hangup: Telnyx → `POST /api/telnyx/cdr` → **Next.js** (usage, call_ended push)

### Outbound call

1. Web/Flutter → `POST /api/telnyx/outbound` → **Next.js**
2. Next.js → Telnyx `create_call` with `webhookUrl: .../api/telnyx/voice`
3. Telnyx → **Python backend** (same flow as inbound)

### Critical path

- `/api/telnyx/voice` and `/api/voice/*` **must** hit the Python backend (port 8000)
- `/api/telnyx/outbound`, `/api/telnyx/cdr`, `/api/internal/*` hit Next.js (port 3000)
- Nginx routes by path; voice locations must be defined **before** the catch-all `/`
