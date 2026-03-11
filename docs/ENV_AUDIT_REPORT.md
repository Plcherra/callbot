# Environment Variable Audit Report

This document captures the complete environment variable audit and normalization for the Next.js + FastAPI hybrid application.

## STEP 1 – Discovery Summary

### All Unique Env Vars Found

| Variable | Location(s) | Runtime | Classification | Notes |
|----------|-------------|---------|----------------|-------|
| **NEXT_PUBLIC_SUPABASE_URL** | app/lib/supabase/client.ts, server.ts, getAuthUser.ts, createClientFromToken.ts, middleware.ts | Next.js client + server | Public | Correct – safe for browser |
| **NEXT_PUBLIC_SUPABASE_ANON_KEY** | Same files as above | Next.js client + server | Public | Correct |
| **SUPABASE_SERVICE_ROLE_KEY** | server.ts, backend/supabase_client.py via config | Next.js server, Python | Secret | Server-only; correct |
| **SUPABASE_URL** | backend/config.py, backend/supabase_client.py, backend/.env.example | Python only | Secret (alias) | Backend fallback for Supabase URL |
| **STRIPE_SECRET_KEY** | app/lib/stripe.ts, verify-prices/route.ts | Next.js server | Secret | Correct |
| **STRIPE_WEBHOOK_SECRET** | app/api/stripe/webhook/route.ts | Next.js server | Secret | Correct |
| **STRIPE_PRICE_*** | app/lib/plans.ts, plans.test.ts | Next.js server | Secret | STARTER, PRO, BUSINESS, ENTERPRISE, PAYG, DEV_TEST, plus legacy STRIPE_PRICE_ID |
| **NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY** | UpgradeCard.tsx (client) | Next.js client | Public | Correct – Stripe.js needs in browser |
| **NEXT_PUBLIC_STRIPE_BUY_BUTTON_ID** | UpgradeCard.tsx | Next.js client | Public | Correct |
| **TELNYX_API_KEY** | app/lib/telnyx.ts, backend via config | Next.js server, Python | Secret | Correct |
| **TELNYX_PUBLIC_KEY** | telnyxWebhook.ts, cdr/route.ts, backend main.py | Next.js server, Python | Secret | Ed25519 public key for webhook verification |
| **TELNYX_WEBHOOK_SECRET** | Same as above | Next.js server, Python | Secret | HMAC verification |
| **TELNYX_WEBHOOK_BASE_URL** | src/shared/lib/env.ts, backend config | Next.js server, Python | Server (shared URL) | Fallback: NEXT_PUBLIC_APP_URL |
| **TELNYX_STREAM_BASE_URL** | backend/config.py, deploy/.env.example | Python | Server | Optional; direct media stream URL |
| **TELNYX_SKIP_VERIFY** | backend/config.py, main.py | Python | Server | Optional; skip webhook verification |
| **TELNYX_CONNECTION_ID** | app/lib/telnyx.ts | Next.js server | Secret | Outbound calls |
| **DEEPGRAM_API_KEY** | backend config, handler.py | Python | Secret | Voice STT |
| **ELEVENLABS_API_KEY** | backend config | Python | Secret | Voice TTS |
| **ELEVENLABS_VOICE_ID** | backend config | Python | Server (non-secret) | Default: 21m00Tcm4TlvDq8ikWAM |
| **GROK_API_KEY** | backend config | Python | Secret | Voice LLM |
| **VOICE_SERVER_API_KEY** | receptionist-prompt, voice/calendar, backend constants, config | Next.js server, Python | Secret | Auth for prompt/calendar API |
| **VOICE_PROMPT_BASE_URL** | backend/voice/constants.py | Python | Server | URL for voice→Next.js prompt fetch |
| **VOICE_DUMMY_TEST** | backend/voice/handler.py | Python | Dev only | os.environ direct; test mode |
| **APP_API_BASE_URL** | backend telnyx/voice_webhook.py, main.py, config | Python | Server | Next.js URL for internal API calls |
| **INTERNAL_API_KEY** | app/api/internal/*, backend config | Next.js server, Python | Secret | Shared secret backend↔Next.js |
| **NEXT_PUBLIC_APP_URL** | Multiple: settings, upgrade, checkout, billing-portal, google callback | Next.js client + server | Public | App base URL; fallback for TELNYX_WEBHOOK_BASE_URL |
| **CRON_SECRET** | cron routes, backend main | Next.js server, Python | Secret | Bearer for cron endpoints |
| **NEXT_SERVER_ACTIONS_ENCRYPTION_KEY** | deploy scripts, docs | Build time | Secret | Required for PM2/VPS |
| **GOOGLE_CLIENT_ID** | google/callback, google.ts, voice/calendar | Next.js server, Python | Secret | OAuth |
| **GOOGLE_CLIENT_SECRET** | Same | Next.js server, Python | Secret | OAuth |
| **NEXT_PUBLIC_GOOGLE_REDIRECT_URI** | Same | Next.js client + server | Public | OAuth redirect; must match Google Console |
| **FIREBASE_SERVICE_ACCOUNT_KEY** | sendCallPush.ts, backend config, push.py | Next.js server, Python | Secret | FCM push |
| **MOBILE_REDIRECT_SCHEME** | google/callback, billing-portal, checkout | Next.js server | Server | Default: echodesk |
| **NEXT_PUBLIC_TEST_CALL_NUMBER** | onboarding/page.tsx | Next.js client | Public | Optional; demo/test number |
| **NEXT_PUBLIC_DEMO_VIDEO_ID** | app/page.tsx | Next.js client | Public | Optional; YouTube video ID |
| **NEXT_PUBLIC_POSTHOG_KEY** | PostHogProvider.tsx | Next.js client | Public | Optional analytics |
| **NEXT_PUBLIC_POSTHOG_HOST** | Same | Next.js client | Public | Optional |
| **NEXT_PUBLIC_SENTRY_DSN** | sentry.*.ts, instrumentation-client.ts | Next.js client + server | Public | Optional; DSN is public |
| **SENTRY_DSN** | sentry.server, sentry.edge | Next.js server | Server (override) | Optional server override |
| **SENTRY_ORG** | next.config.js | Build/CI | CI | Source maps |
| **SENTRY_PROJECT** | next.config.js | Build/CI | CI | Source maps |
| **SENTRY_AUTH_TOKEN** | next.config.js | Build/CI | CI | Source map upload |
| **NODE_ENV** | Multiple | Both | Runtime | Set by Next.js/Node |
| **NEXT_RUNTIME** | instrumentation.ts | Next.js | Runtime | nodejs vs edge |
| **CI** | next.config.js | CI | CI | Silences Sentry |
| **PORT** | backend/voice/constants.py | Python | Server | Default 8000; used in get_prompt_base fallback |

### Mobile (Flutter) – Separate Env

- **API_BASE_URL**, **SUPABASE_URL**, **SUPABASE_ANON_KEY**, **DEEP_LINK_SCHEME** – in mobile/.env.example; not part of Next.js/Python shared env.

---

## STEP 2 – Conflicts and Dangerous Patterns

### Duplication / Aliasing

1. **SUPABASE_URL vs NEXT_PUBLIC_SUPABASE_URL**: Backend supabase_client.py accepts both. Single source of truth: NEXT_PUBLIC (shared) with SUPABASE_URL as alias for backend-only deploys.
2. **APP_API_BASE_URL vs NEXT_PUBLIC_APP_URL**: Different semantics. APP_API_BASE_URL = Next.js URL (backend calls it). NEXT_PUBLIC_APP_URL = app URL (client + server). In production they often match. Recommendation: Keep both; document that APP_API_BASE_URL defaults to NEXT_PUBLIC_APP_URL when unset in backend.
3. **TELNYX_WEBHOOK_BASE_URL fallback to NEXT_PUBLIC_APP_URL**: Already in src/shared/lib/env.ts. Sensible.

### Bypass of Config (Python)

- **voice/constants.py** used `os.environ.get()` for VOICE_PROMPT_BASE_URL, VOICE_SERVER_API_KEY, PORT instead of settings. Fixed by refactoring to use config.

### Dangerous Patterns

- **Missing vars causing cryptic crashes**: Several places use `process.env.X!` (non-null assert). Central validation added in Next.js and Python.

### .env.example Inconsistencies

- **deploy/env/.env.example** vs **.env.local.example** vs **backend/.env.example**: Stripe plans differed (ENTERPRISE, DEV_TEST missing in deploy). Unified in this implementation.

---

## STEP 3 – Proposed Naming Convention

### Rules

- **Public (browser-safe)**: `NEXT_PUBLIC_*` – correct for Supabase, Stripe publishable, App URL, Google redirect, PostHog, Sentry DSN.
- **Server/secret**: No NEXT_PUBLIC_ prefix. Use descriptive names: `*_API_KEY`, `*_SECRET`, `*_SERVICE_ROLE_KEY`.
- **Shared config (URLs, non-secrets)**: Same name in both runtimes. Examples: `NEXT_PUBLIC_APP_URL`, `TELNYX_WEBHOOK_BASE_URL`.
- **Backend-specific**: `APP_API_BASE_URL`, `INTERNAL_API_KEY`, `VOICE_SERVER_API_KEY` – no NEXT_PUBLIC.

### Compatibility Shims

| Canonical Name | Deprecated Alias | Where |
|----------------|------------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `SUPABASE_URL` | Backend config: prefer NEXT_PUBLIC, fallback SUPABASE_URL |
| `NEXT_PUBLIC_APP_URL` | (none) | TELNYX_WEBHOOK_BASE_URL fallback (already) |
| `APP_API_BASE_URL` | (none) | Fallback to NEXT_PUBLIC_APP_URL in backend when unset |

### No Renames Required

Current names are largely consistent. Changes: (1) unified .env.example files, (2) added validation, (3) fixed Python constants to use config.
