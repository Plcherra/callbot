# AI Receptionist – Echodesk

Mobile-first AI phone receptionist: **Flutter app** (primary), **Python FastAPI backend** (voice + mobile API + Stripe + OAuth), **static landing page**. No Next.js.

## Features

- **Flutter mobile app**: Primary user interface; subscription, calendar, receptionists, call history
- **Voice pipeline**: Telnyx webhook → Python → Deepgram STT → Grok LLM → ElevenLabs TTS → Telnyx
- **Mobile API**: Push tokens, sync, Stripe Checkout/Billing Portal, Google OAuth, receptionists CRUD
- **Static landing**: Hero, pricing, demo video, App Store / Play Store links
- **Cron**: PAYG billing, usage reset

## Tech Stack

- **Backend**: Python FastAPI (voice webhook, WebSocket, mobile API, Stripe webhook, Google OAuth, cron)
- **Mobile**: Flutter
- **Landing**: Static HTML (Tailwind CDN)
- **Data**: Supabase (auth, users, receptionists, Stripe sync)
- **Voice AI**: Deepgram, Grok, ElevenLabs
- **Telnyx**: Phone provisioning, voice webhooks, CDR

## Quick Start

### Backend (Python)

```bash
python3 -m venv venv
./venv/bin/pip install -r backend/requirements.txt
cp deploy/env/.env.example .env.local
# Fill in .env.local (Supabase, Telnyx, voice AI keys, etc.)
./venv/bin/python scripts/validate-env.py
./venv/bin/uvicorn backend.main:app --reload --port 8000
```

### Mobile (Flutter)

```bash
cd mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://localhost:8000
```

### Landing

Open `landing/dist/index.html` in a browser, or serve via nginx (see [docs/deployment.md](docs/deployment.md)).

## Project Structure

```
├── backend/             # Python FastAPI (voice, mobile API, Stripe, OAuth, cron)
├── landing/             # Static landing (landing/dist/)
├── mobile/              # Flutter app
├── deploy/              # Deploy scripts, nginx, env template
├── scripts/             # validate-env.py
└── docs/                # Documentation
```

## Environment Variables

See `deploy/env/.env.example`. Key vars:

- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Telnyx**: `TELNYX_API_KEY`, `TELNYX_WEBHOOK_BASE_URL`, `TELNYX_CONNECTION_ID`
- **Voice AI**: `DEEPGRAM_API_KEY`, `GROK_API_KEY`, `ELEVENLABS_API_KEY`
- **Stripe**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`
- **Google OAuth**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- **App**: `APP_URL` (e.g. `https://echodesk.us`)

## Docs

- [FULL_PROJECT_OVERVIEW.md](docs/FULL_PROJECT_OVERVIEW.md) – Architecture, env, deploy, call flow
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) – Component diagram, data flow
- [deployment.md](docs/deployment.md) – VPS deploy, nginx, PM2
- [CALL_FLOW_DIAGNOSTIC.md](docs/CALL_FLOW_DIAGNOSTIC.md) – Call troubleshooting
- [troubleshooting.md](docs/troubleshooting.md) – General troubleshooting
