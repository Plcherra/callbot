# Environment Variables

All env variables: names, purpose, production vs dev. See `deploy/env/.env.example` for template.

## Variable Reference

| Variable | Required | Dev | Production | Purpose |
|----------|----------|-----|------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | ✓ | ✓ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | ✓ | ✓ | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | ✓ | ✓ | Supabase service role (server only) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | pk_test_ | pk_live_ | Stripe publishable |
| `STRIPE_SECRET_KEY` | Yes | sk_test_ | sk_live_ | Stripe secret |
| `STRIPE_WEBHOOK_SECRET` | Yes | whsec_... | whsec_... | Stripe webhook signing |
| `STRIPE_PRICE_*` | Yes | ✓ | ✓ | Price IDs (Starter, Pro, Business, PAYG) |
| `TELNYX_API_KEY` | Yes | ✓ | ✓ | Telnyx API key |
| `TELNYX_PUBLIC_KEY` | Recommended | - | ✓ | Telnyx webhook Ed25519 verification |
| `TELNYX_WEBHOOK_SECRET` | Alternative | - | ✓ | Telnyx webhook HMAC verification |
| `TELNYX_WEBHOOK_BASE_URL` | Yes | localhost/ngrok | https://echodesk.us | Public URL for Telnyx webhooks |
| `TELNYX_CONNECTION_ID` | Outbound | - | ✓ | Call Control connection ID |
| `DEEPGRAM_API_KEY` | Yes | ✓ | ✓ | Deepgram STT (backend) |
| `ELEVENLABS_API_KEY` | Yes | ✓ | ✓ | ElevenLabs TTS (backend) |
| `ELEVENLABS_VOICE_ID` | Yes | ✓ | ✓ | ElevenLabs voice ID |
| `GROK_API_KEY` | Yes | ✓ | ✓ | Grok LLM (backend) |
| `VOICE_SERVER_API_KEY` | Optional | - | ✓ | Auth for prompt/calendar API |
| `APP_API_BASE_URL` | Yes (backend) | http://localhost:3000 | https://echodesk.us | Next.js URL for backend→Next.js calls |
| `INTERNAL_API_KEY` | Yes (backend) | ✓ | ✓ | Shared secret backend↔Next.js (FCM, quota) |
| `NEXT_PUBLIC_APP_URL` | Yes | http://localhost:3000 | https://echodesk.us | App base URL |
| `CRON_SECRET` | Yes | ✓ | ✓ | Bearer token for cron endpoints |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Yes (PM2) | - | ✓ | Base64 key for Server Actions (generate: `openssl rand -base64 32`) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Yes (push) | ✓ | ✓ | Firebase service account JSON |
| `GOOGLE_CLIENT_ID` | Yes | ✓ | ✓ | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Yes | ✓ | ✓ | Google OAuth |
| `NEXT_PUBLIC_GOOGLE_REDIRECT_URI` | Yes | http://localhost:3000/... | https://echodesk.us/... | OAuth redirect |

## Dev vs Production

- **Dev:** `NEXT_PUBLIC_APP_URL`, `TELNYX_WEBHOOK_BASE_URL`, `APP_API_BASE_URL` → localhost or ngrok
- **Production:** All must be `https://echodesk.us`
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` must be set **before** `npm run build` on VPS
- Backend and Next.js share `.env` / `.env.local` in project root; `INTERNAL_API_KEY` must match
