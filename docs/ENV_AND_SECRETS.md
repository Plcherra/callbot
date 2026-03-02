# Environment Variables and Secrets Rotation

Reference for all environment variables used by the echodesk app. See `.env.local.example` for the template.

## Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side only) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | Stripe publishable key |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook signing secret for `/api/stripe/webhook` |
| `STRIPE_PRICE_*` | Yes | Price IDs for Starter, Pro, Business, PAYG plans |
| `TELNYX_API_KEY` | Yes | Telnyx API key for Call Control and provisioning |
| `TELNYX_PUBLIC_KEY` | Optional | Telnyx webhook verification (RSA public key) |
| `TELNYX_WEBHOOK_SECRET` | Optional | Telnyx webhook verification (HMAC secret) |
| `TELNYX_WEBHOOK_BASE_URL` | Yes | Public app URL for webhooks (e.g. `https://echodesk.us`) |
| `TELNYX_CONNECTION_ID` | Yes for outbound | Call Control connection ID for outbound calls |
| `DEEPGRAM_API_KEY` | Yes | Deepgram STT API key |
| `ELEVENLABS_API_KEY` | Yes | ElevenLabs TTS API key |
| `ELEVENLABS_VOICE_ID` | Yes | ElevenLabs voice ID (default: `21m00Tcm4TlvDq8ikWAM`) |
| `GROK_API_KEY` | Yes | Grok LLM API key |
| `VOICE_SERVER_API_KEY` | Optional | Auth for `/api/receptionist-prompt`, `/api/voice/calendar` |
| `GOOGLE_CLIENT_ID` | Yes for Calendar | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes for Calendar | Google OAuth client secret |
| `NEXT_PUBLIC_GOOGLE_REDIRECT_URI` | Yes for Calendar | OAuth redirect URI |
| `NEXT_PUBLIC_APP_URL` | Yes | App base URL |
| `CRON_SECRET` | Yes for cron | Bearer token for cron endpoints |
| `NEXT_PUBLIC_POSTHOG_*` | Optional | PostHog analytics |

## Secrets Rotation

### Telnyx

1. **TELNYX_API_KEY**: Create a new API key in [Telnyx Portal](https://portal.telnyx.com) → API Keys. Update env and restart. Revoke the old key after rollout.
2. **TELNYX_WEBHOOK_SECRET** (HMAC): If you rotate, update both the env var and the webhook configuration in the Telnyx Portal so they match.
3. **TELNYX_PUBLIC_KEY** (RSA): Same as above—Portal webhook config and env must stay in sync.

### Deepgram, ElevenLabs, Grok

1. Rotate in the provider dashboard (console.deepgram.com, elevenlabs.io, x.ai).
2. Update the env var.
3. Restart the app (or redeploy). No webhook reconfiguration needed for these.

### Stripe

1. **STRIPE_WEBHOOK_SECRET**: Create a new webhook endpoint in Stripe Dashboard → Developers → Webhooks. Copy the new signing secret. Update env, redeploy, then delete the old endpoint.
2. **STRIPE_SECRET_KEY**: Use Stripe's key rotation if available, or create a restricted key. Update env and restart.

### CRON_SECRET

1. Generate a new random string (e.g. `openssl rand -hex 32`).
2. Update the env in your deployment (Vercel, PM2, etc.).
3. Update your cron job configuration (Vercel Cron, GitHub Actions, etc.) to send `Authorization: Bearer <new_secret>`.

See [CRON.md](CRON.md) for endpoint schedule and configuration.

### SUPABASE_SERVICE_ROLE_KEY

1. Rotate in Supabase Dashboard → Project Settings → API.
2. Update all app instances (Vercel, PM2, etc.) and restart.
3. The service role key bypasses RLS—keep it server-side only and never expose it to the client.
