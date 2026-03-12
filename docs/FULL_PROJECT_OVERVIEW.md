# Callbot / Echodesk – Full Project Overview

AI phone receptionist: **Mobile-first architecture** – Flutter app (primary), Python FastAPI backend (voice + mobile API + Stripe + OAuth + cron), static landing page. No Next.js.

## Architecture

```mermaid
flowchart TB
    subgraph external [External]
        Caller[Caller]
        Telnyx[Telnyx Network]
        User[Flutter App]
    end

    subgraph infra [Infrastructure]
        CF[Cloudflare Tunnel]
        Nginx[Nginx :80/443]
    end

    subgraph apps [Applications]
        Python[Python :8000]
        Static[Static landing]
    end

    subgraph services [External Services]
        Supabase[Supabase]
        Deepgram[Deepgram STT]
        Grok[Grok LLM]
        ElevenLabs[ElevenLabs TTS]
        Stripe[Stripe]
        Google[Google OAuth]
    end

    Caller --> Telnyx
    Telnyx -->|Webhook + WebSocket| CF
    CF --> Nginx
    User --> CF
    CF --> Nginx
    Nginx -->|/api/*| Python
    Nginx -->|/| Static
    Python --> Supabase
    Python --> Deepgram
    Python --> Grok
    Python --> ElevenLabs
    Python --> Stripe
    Python --> Google
```

### Components

| Component | Port | Purpose |
|-----------|------|---------|
| **callbot-voice** (PM2) | 8000 | Python FastAPI: voice webhook, CDR, outbound, `/api/voice/stream`, `/api/mobile/*`, `/api/stripe/webhook`, `/api/google/callback`, `/api/cron/*`, `/api/health`, `/api/quota-check` |
| **Nginx** | 80, 443 | Reverse proxy: `/api/*` → 8000, `/` → static landing (`landing/dist`) |

### Critical Routing

- All `/api/*` (voice, telnyx, mobile, stripe, google, cron, health) → **Python** (8000)
- `/` → **Static files** from `landing/dist` (served by nginx)
- Nginx voice/telnyx locations must be defined **before** the catch-all `/api/` (use `^~` modifier)
- If Cloudflare Tunnel is used, it must point at **nginx (:80)**, not directly at Python

---

## Call Flow (Independent of Web/Mobile)

Calls do not depend on the web app or Flutter. The chain is:

1. **Caller** → Telnyx (SIP/VoIP)
2. **Telnyx** → `POST https://echodesk.us/api/telnyx/voice` (webhook)
3. **Nginx** → Python backend (8000)
4. **Python** → Lookup receptionist (Supabase), **local quota check**, answer call, `stream_start(stream_url)`
5. **Telnyx** → WebSocket `wss://echodesk.us/api/voice/stream?...`
6. **Python** → Deepgram (STT) → Grok (LLM) → ElevenLabs (TTS) → audio back to Telnyx
7. Call ends → Telnyx sends CDR to **Python** (`/api/telnyx/cdr`)

**Call flow reference:** [CALL_FLOW_DIAGNOSTIC.md](CALL_FLOW_DIAGNOSTIC.md) – failure points, fixes, diagnostics.

---

## Environment Variables

Single source: `deploy/env/.env.example`. Copy to project root as `.env` or `.env.local`.

### Required for Voice (Backend)

| Variable | Purpose |
|----------|---------|
| `TELNYX_API_KEY` | Answer + stream_start API calls |
| `TELNYX_WEBHOOK_BASE_URL` | Base URL for stream (e.g. `https://echodesk.us`). **Not** localhost. |
| `DEEPGRAM_API_KEY` | Speech-to-text |
| `GROK_API_KEY` | LLM |
| `ELEVENLABS_API_KEY` | Text-to-speech |
| `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend DB access |

### Required for Outbound (Python)

| Variable | Purpose |
|----------|---------|
| `TELNYX_CONNECTION_ID` | Call Control connection ID for outbound calls |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | JWT validation for Bearer token (Flutter outbound) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | FCM push for incoming/ended calls (JSON string) |

### Required for Mobile API

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Stripe Checkout, Billing Portal |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Calendar OAuth |
| `GOOGLE_REDIRECT_URI` | OAuth callback (e.g. `https://echodesk.us/api/google/callback`) |
| `APP_URL` | Base URL for redirects (e.g. `https://echodesk.us`) |

### Optional / Voice

| Variable | Purpose |
|----------|---------|
| `TELNYX_STREAM_BASE_URL` | Direct URL for media stream (bypass Cloudflare if WS blocked) |
| `TELNYX_SKIP_VERIFY` | Skip webhook signature verification (Cloudflare strips headers) |
| `TELNYX_PUBLIC_KEY` / `TELNYX_WEBHOOK_SECRET` | Webhook verification |

### Cron

| Variable | Purpose |
|----------|---------|
| `CRON_SECRET` | Bearer token for `/api/cron/*` (payg-billing, reset-usage) |

Full audit: [ENV_AUDIT_REPORT.md](ENV_AUDIT_REPORT.md).

---

## Deployment Flow

### GitHub Actions (Push to main)

1. Checkout code
2. SSH to VPS → `cd $APP_PATH`, `git pull`, `./deploy/scripts/deploy.sh`
3. `deploy.sh`: venv + pip, validate env, PM2 start callbot-voice, sync nginx

### Deploy Script Steps

1. Create venv, `pip install -r backend/requirements.txt`
2. `./venv/bin/python scripts/validate-env.py`
3. PM2: delete callbot-voice, `pm2 start ecosystem.config.cjs`
4. `./deploy/scripts/sync-nginx-config.sh`
5. `./deploy/scripts/validate-infra-before-start.sh`

### VPS Prerequisites

- Python 3, pip3, PM2, nginx
- `.env` / `.env.local` in project root
- Nginx config synced: `./deploy/scripts/sync-nginx-config.sh`
- Cloudflare Tunnel (if used): ingress → `http://127.0.0.1:80` (nginx)
- `landing/dist/` with `index.html` (static landing)

### Restore Call Flow After Issues

```bash
./deploy/scripts/restore-call-flow.sh
```

See [DEPLOY_CHECKLIST.md](DEPLOY_CHECKLIST.md) for a pre-deploy checklist.

---

## Project Structure

```
├── backend/             # Python FastAPI (voice, mobile API, Stripe, OAuth, cron)
├── landing/             # Static landing page (landing/dist/index.html)
├── mobile/              # Flutter app (user-facing)
├── deploy/              # Deploy scripts, nginx configs, env template
├── scripts/             # validate-env.py, etc.
├── docs/                # Documentation
└── ecosystem.config.cjs # PM2 config (callbot-voice only)
```

---

## Key Docs

| Doc | Purpose |
|-----|---------|
| [CALL_FLOW_DIAGNOSTIC.md](CALL_FLOW_DIAGNOSTIC.md) | Call flow failure points, fixes, diagnostics |
| [DEPLOY_CHECKLIST.md](DEPLOY_CHECKLIST.md) | Pre-deploy checklist |
| [ENV_AUDIT_REPORT.md](ENV_AUDIT_REPORT.md) | Full env var audit |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Component diagram, data flow |
