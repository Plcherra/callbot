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
| `TELNYX_PUBLIC_KEY` | Optional | Telnyx webhook verification (Ed25519 public key, PEM or base64). **Preferred** method. |
| `TELNYX_WEBHOOK_SECRET` | Optional | Telnyx webhook verification (HMAC secret). Legacy fallback when Ed25519 headers unavailable; Telnyx sends `x-telnyx-signature`. |
| `TELNYX_SKIP_VERIFY` | Optional | Set to `1` to skip webhook signature verification. Use only when proxy (e.g. Cloudflare Tunnel) strips headers. **Always set `TELNYX_ALLOWED_IPS`** for defense-in-depth. |
| `TELNYX_ALLOWED_IPS` | Optional | Comma-separated IPs allowed when `TELNYX_SKIP_VERIFY=1`. Empty = no allowlist. Add Telnyx outbound IPs for extra security. |
| `TELNYX_WEBHOOK_BASE_URL` | Yes | Public app URL for webhooks (e.g. `https://echodesk.us`) |
| `TELNYX_CONNECTION_ID` | Yes for outbound | Call Control connection ID for outbound calls |
| `DEEPGRAM_API_KEY` | Yes | Deepgram STT API key |
| `ELEVENLABS_API_KEY` | Yes | ElevenLabs TTS API key |
| `ELEVENLABS_VOICE_ID` | Yes | ElevenLabs voice ID (default: `21m00Tcm4TlvDq8ikWAM`) |
| `GROK_API_KEY` | Yes | Grok LLM API key |
| `VOICE_SERVER_API_KEY` | Optional | Auth for `/api/receptionist-prompt`, `/api/voice/calendar` |
| `APP_API_BASE_URL` | Yes for voice backend | Next.js app URL (e.g. `https://echodesk.us`). Used by the Python backend to call internal APIs. |
| `INTERNAL_API_KEY` | Yes for voice backend | Shared secret for backend → Next.js internal APIs (`/api/internal/send-call-push`, `/api/internal/check-inbound-quota`). Must match between Next.js and backend. |
| `CRON_SECRET` | Optional for backend | Same as Next.js CRON_SECRET. Used when triggering billing cron via backend's `/api/cron/payg-billing` proxy. |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Yes for push | JSON string of Firebase service account key. Used by backend (preferred) or Next.js for FCM. See [FIREBASE_PUSH_SETUP.md](FIREBASE_PUSH_SETUP.md). |
| `GOOGLE_CLIENT_ID` | Yes for Calendar | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes for Calendar | Google OAuth client secret |
| `NEXT_PUBLIC_GOOGLE_REDIRECT_URI` | Yes for Calendar | OAuth redirect URI |
| `NEXT_PUBLIC_APP_URL` | Yes | App base URL |
| `CRON_SECRET` | Yes for cron | Bearer token for cron endpoints |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | **Yes for PM2/VPS** | Base64 AES key so Server Action IDs stay stable across rebuilds. Prevents "Failed to find Server Action" errors. Generate: `openssl rand -base64 32` |
| `NEXT_PUBLIC_POSTHOG_*` | Optional | PostHog analytics |

## Secrets Rotation

### Telnyx

1. **TELNYX_API_KEY**: Create a new API key in [Telnyx Portal](https://portal.telnyx.com) → API Keys. Update env and restart. Revoke the old key after rollout.
2. **TELNYX_WEBHOOK_SECRET** (HMAC): If you rotate, update both the env var and the webhook configuration in the Telnyx Portal so they match.
3. **TELNYX_PUBLIC_KEY** (Ed25519): Same as above—Portal webhook config and env must stay in sync.

### INTERNAL_API_KEY / APP_API_BASE_URL

The Python voice backend calls Next.js internal APIs for FCM push (incoming calls) and inbound quota checks. Both services must share the same `INTERNAL_API_KEY` (Next.js reads `INTERNAL_API_KEY`, backend reads `internal_api_key` which maps to `INTERNAL_API_KEY`). The backend also needs `APP_API_BASE_URL` set to the Next.js base URL (e.g. `https://echodesk.us`).

### Deepgram, ElevenLabs, Grok

1. Rotate in the provider dashboard (console.deepgram.com, elevenlabs.io, x.ai).
2. Update the env var.
3. Restart the app (or redeploy). No webhook reconfiguration needed for these.

### Stripe

1. **STRIPE_WEBHOOK_SECRET**: Create a new webhook endpoint in Stripe Dashboard → Developers → Webhooks. Copy the new signing secret. Update env, redeploy, then delete the old endpoint.
2. **STRIPE_SECRET_KEY**: Use Stripe's key rotation if available, or create a restricted key. Update env and restart.

### NEXT_SERVER_ACTIONS_ENCRYPTION_KEY (PM2 / VPS)

Required when self-hosting with PM2 or any multi-process setup. Without it, Next.js generates new Server Action IDs on each build, causing "Failed to find Server Action" when users have cached pages.

1. Generate: `openssl rand -base64 32`
2. Add to `.env.local` (or your deployment env) **before** running `npm run build`
3. Rebuild and redeploy
4. Users may need a hard refresh (Ctrl+Shift+R) after deploy if they had old pages open

### CRON_SECRET

1. Generate a new random string (e.g. `openssl rand -hex 32`).
2. Update the env in your deployment (Vercel, PM2, etc.).
3. Update your cron job configuration (system cron on VPS, GitHub Actions, etc.) to send `Authorization: Bearer <new_secret>`. See [CRON.md](CRON.md).

See [CRON.md](CRON.md) for endpoint schedule and configuration.

### SUPABASE_SERVICE_ROLE_KEY

1. Rotate in Supabase Dashboard → Project Settings → API.
2. Update all app instances (Vercel, PM2, etc.) and restart.
3. The service role key bypasses RLS—keep it server-side only and never expose it to the client.
