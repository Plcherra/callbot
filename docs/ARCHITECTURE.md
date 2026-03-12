# Architecture

High-level diagram and explanation of mobile-first architecture: Flutter + Python FastAPI backend + static landing.

## Overview

Callbot/Echodesk is an AI phone receptionist with a **mobile-first architecture**:

```
User → Flutter app (primary) or static website (landing, download links)
Phone call → Telnyx → Python backend (webhook + WebSocket) → Deepgram/Grok/ElevenLabs → Telnyx → Caller
```

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Nginx (echodesk.us:443)                                 │
│  /api/* → Python:8000  |  / → static files (landing/dist)                         │
└─────────────────────────────────────────────────────────────────────────────────┘
        │                                              │
        ▼                                              ▼
┌───────────────────────────────┐          ┌───────────────────────────────┐
│  Python FastAPI :8000         │          │  Static landing               │
│  - /api/telnyx/voice          │◄──Telnyx─│  - index.html (Tailwind CDN)  │
│  - /api/telnyx/cdr            │  webhook │  - App Store / Play Store     │
│  - /api/telnyx/outbound       │  + WS    │  - Pricing, testimonials      │
│  - /api/voice/stream          │          └───────────────────────────────┘
│  - /api/mobile/* (Stripe,     │
│    OAuth, receptionists, etc.)│
│  - /api/stripe/webhook        │
│  - /api/google/callback       │
│  - /api/cron/*                │
│  - /api/health, /api/quota-check│
│  - Quota, FCM push            │
│  - Deepgram/Grok/ElevenLabs   │
└───────────────┬───────────────┘
                │
                ▼
      ┌─────────────────────┐
      │ Supabase, Stripe,   │
      │ Google OAuth        │
      └─────────────────────┘
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

### Mobile API

- Flutter calls `API_BASE_URL` (e.g. `https://echodesk.us`) for all `/api/mobile/*` and `/api/telnyx/outbound`
- Python serves: push-token, sync-session, google-auth-url, checkout, billing-portal, receptionists CRUD, settings
- Stripe webhook: `POST /api/stripe/webhook` (checkout.session.completed, subscription events)
- Google OAuth: `GET /api/google/callback` → redirect to `echodesk://google-callback`

### Critical path

- `/api/*` (all API routes) → **Python** (port 8000)
- `/` → **Static** (landing/dist served by nginx)
- Nginx routes voice/telnyx paths to Python **before** the catch-all `/api/` (use `^~` modifier)

**Troubleshooting:** If incoming calls are not answered, see [CALL_FLOW_DIAGNOSTIC.md](CALL_FLOW_DIAGNOSTIC.md) and run `./deploy/scripts/diagnose-call-flow.sh` on the VPS.
