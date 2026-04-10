# Environment variables

Loaded via Pydantic **`Settings`** in `backend/config.py` from project root **`.env`** / **`.env.local`**. Names below are the **environment variable** names (UPPER_SNAKE_CASE).

## Telnyx (telephony + SMS)

| Variable | Purpose | Example | Common misconfig |
|----------|---------|---------|------------------|
| **`TELNYX_API_KEY`** | Bearer token for Voice API (answer, stream, record) and Messages API (SMS). **Required** at startup (`validate_telnyx`). | `KEY0123...` | Missing → voice webhook fails fast; 401 from Telnyx. |
| **`TELNYX_WEBHOOK_BASE_URL`** | Public **https** origin for building **`stream_url`** (`wss://…/api/voice/stream?…`) and default SMS **`webhook_url`** (`{base}/api/telnyx/sms`). | `https://voice.example.com` | Trailing slash usually OK (code strips). Wrong host → Telnyx cannot open media WebSocket or SMS webhooks. |
| **`TELNYX_STREAM_BASE_URL`** | Optional **alternate** origin for **WebSocket only** when media must hit a different hostname than HTTP webhooks. | `https://stream.example.com` | If unset, **`TELNYX_WEBHOOK_BASE_URL`** is used. |
| **`TELNYX_PUBLIC_KEY`** | Telnyx Ed25519 public key material for **`telnyx-signature-ed25519`** verification on webhooks. | (from Telnyx portal) | Wrong key → **403** on `/api/telnyx/*`. |
| **`TELNYX_WEBHOOK_SECRET`** | Shared secret for **HMAC** webhook verification when Ed25519 headers are unavailable. | long random string | Must match Telnyx app “secret” if using HMAC fallback. |
| **`TELNYX_SKIP_VERIFY`** | If true, allows webhooks when **Ed25519 headers are missing** (e.g. proxy stripped). **Defense in depth:** **`TELNYX_ALLOWED_IPS` must be non-empty** or requests are rejected. | `1` / `true` | Enabling without **allowlist** → startup warning and **403**; enabling without understanding → open webhooks. |
| **`TELNYX_ALLOWED_IPS`** | Comma-separated **exact IPs and/or CIDR blocks** for clients allowed when verification is skipped or as IP check in skip path. Parsed with **`ipaddress`** (Python). | `192.76.120.0/24,203.0.113.10` | Empty under **`SKIP_VERIFY`** → reject. Wrong CIDR → legitimate Telnyx egress blocked. **Note:** behind **`X-Forwarded-For`**, ensure your reverse proxy sets the real client IP correctly. |
| **`TELNYX_CONNECTION_ID`** | Telnyx **Call Control Application** connection id for **outbound** calls (`/api/telnyx/outbound`). | UUID from portal | Missing → outbound route errors. |
| **`TELNYX_ALLOW_RECEPTIONIST_FALLBACK`** | If **true**, unmatched DID uses **first active** receptionist (dangerous). Default **false**. | `0` | Leave **false** in production to catch DID misconfiguration. |
| **`TELNYX_ENABLE_RECORDING`** | If **true** (default), sends **`record_start`** on answered calls. | `true` | `false` → no recording attempts. |

## Voice AI

| Variable | Purpose | Example | Common misconfig |
|----------|---------|---------|------------------|
| **`DEEPGRAM_API_KEY`** | Live transcription (server). **Required** (`validate_voice_keys`). | | Missing → WebSocket closes **1011** “Server misconfiguration”. |
| **`GROK_API_KEY`** | xAI Grok for chat / tool use. **Required**. | | Missing → same as Deepgram. |
| **`VOICE_SERVER_API_KEY`** | Shared secret for **`/api/receptionist-prompt`** and **`/api/voice/calendar`** (headers **`x-voice-server-key`** or **`x-voice-api-key`**). | long random | Missing → prompt/calendar not wired from stream handler. Mismatch → **401**. |
| **`VOICE_PROMPT_BASE_URL`** | Base URL of the app that serves prompts (often Next.js). Handler falls back to **localhost:PORT** only if unset. | `https://app.example.com` | Wrong URL → default greeting/prompt or fetch failures. |
| **`VOICE_DUMMY_TEST`** | **`1`** — sends dummy audio instead of real pipeline (debug only). | unset in prod | |
| **`SKIP_GOOGLE_TTS_VALIDATION`** | **`1` / true** — skip Google credential check at startup. | | Only for CI/dev without ADC. |

## Google TTS and Calendar

| Variable | Purpose | Example | Common misconfig |
|----------|---------|---------|------------------|
| **`GOOGLE_APPLICATION_CREDENTIALS`** | Path to service account JSON for **Text-to-Speech** (and other Google APIs using ADC). | `/secrets/tts.json` | Missing/invalid → startup validation failure (unless skip flag). |
| **`GOOGLE_CLIENT_ID`**, **`GOOGLE_CLIENT_SECRET`**, **`GOOGLE_REDIRECT_URI`** / **`NEXT_PUBLIC_GOOGLE_REDIRECT_URI`** | OAuth for user calendar linking. | | Wrong redirect → OAuth errors in app (not voice stream). |
| **`TTS_PROVIDER`** | Must align with code (`google`). | `google` | |

Additional **`GOOGLE_TTS_*`**, **`TTS_*`** caps, cache, and retry knobs are in `config.py` (optional tuning).

## Supabase

| Variable | Purpose | Example | Common misconfig |
|----------|---------|---------|------------------|
| **`NEXT_PUBLIC_SUPABASE_URL`** | Canonical Supabase URL (**preferred**). | `https://xxx.supabase.co` | |
| **`SUPABASE_URL`** | Deprecated alias; still read if canonical unset. | | Triggers deprecation warning. |
| **`SUPABASE_SERVICE_ROLE_KEY`** | Server-side DB/admin access. **Required**. | | Missing → startup **`validate_supabase`** fails. |
| **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** | JWT validation for mobile routes. **Required**. | | Missing → startup failure. |

## Stripe, Firebase, cron, app URLs

Used by billing, push, and redirects — see `config.py` for full list: **`STRIPE_SECRET_KEY`**, **`STRIPE_WEBHOOK_SECRET`**, **`FIREBASE_SERVICE_ACCOUNT_KEY`**, **`CRON_SECRET`**, **`APP_API_BASE_URL`** / **`NEXT_PUBLIC_APP_URL`**, **`INTERNAL_API_KEY`**, **`SENTRY_DSN`**, **`PORT`**, etc.

## Quick reference — URLs Telnyx and clients call

| Endpoint | Use |
|----------|-----|
| **`{TELNYX_WEBHOOK_BASE_URL}/api/telnyx/voice`** | Voice Call Control webhooks |
| **`{TELNYX_WEBHOOK_BASE_URL}/api/telnyx/cdr`** | CDR / usage / recording events (when configured separately) |
| **`{TELNYX_WEBHOOK_BASE_URL}/api/telnyx/sms`** | Messaging status webhooks |
| **`wss://{host}/api/voice/stream?...`** | Media stream (`host` from **`TELNYX_STREAM_BASE_URL`** or **`TELNYX_WEBHOOK_BASE_URL`**) |

Replace `https://` with `wss://` and `http://` with `ws://` automatically in code (`get_telnyx_ws_base`).
