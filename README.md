# AI Receptionist – Echodesk

Mobile-first AI phone receptionist: **Flutter app** (primary), **Python FastAPI backend** (voice + mobile API + Stripe + OAuth), **static landing page**. No Next.js.

## Documentation rules

- **Canonical docs** are exactly the Markdown files allowed by [`scripts/check-docs.sh`](scripts/check-docs.sh) (see [`docs/README.md`](docs/README.md)). Do not add new files under `docs/` unless you intentionally update that allowlist in the same change.
- **Behavior changes** should include doc updates in the same PR when they affect operators or integration (voice, SMS, env, runbook).
- **Source of truth:** `docs/core/VOICE_PIPELINE.md` and `docs/core/SMS_FLOW.md` describe intended behavior; if code disagrees, treat that as a bug unless you are deliberately changing the contract (then update the doc).

## Features

- **Flutter mobile app**: Primary user interface; subscription, calendar, receptionists, call history
- **Voice pipeline**: Telnyx webhook → Python → Deepgram STT → Grok LLM → TTS (Google Cloud) → Telnyx
- **Mobile API**: Push tokens, sync, Stripe Checkout/Billing Portal, Google OAuth, receptionists CRUD
- **Static landing**: Hero, pricing, demo video, App Store / Play Store links
- **Cron**: PAYG billing, usage reset

## Tech Stack

- **Backend**: Python FastAPI (voice webhook, WebSocket, mobile API, Stripe webhook, Google OAuth, cron)
- **Mobile**: Flutter
- **Landing**: Static HTML (Tailwind CDN)
- **Data**: Supabase (auth, users, receptionists, Stripe sync)
- **Voice AI**: Deepgram, Grok, Google Cloud TTS
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

Open `landing/dist/index.html` in a browser, or serve via nginx (`deploy/nginx/callbot.conf.template` and `deploy/README.md`).

## Project Structure

```
├── backend/             # Python FastAPI (voice, mobile API, Stripe, OAuth, cron)
├── landing/             # Static landing (landing/dist/)
├── mobile/              # Flutter app
├── deploy/              # Deploy scripts, nginx templates, env examples
├── scripts/             # validate-env.py
└── docs/                # MVP docs: README + core/ + ops/
```

## Environment Variables

See **`deploy/env/.env.example`** and **`docs/core/ENV.md`**. Key groups: Supabase, Telnyx, `DEEPGRAM_API_KEY`, `GROK_API_KEY`, Google TTS credentials, Stripe, OAuth.

## Docs

Start with **[docs/README.md](docs/README.md)** — overview, voice pipeline, SMS, env, runbook.
