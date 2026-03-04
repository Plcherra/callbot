# Flutter Mobile App Reference

Reference for the Echodesk Flutter mobile app. The app lives in `mobile/` and consumes the Next.js backend API.

## Related Docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — Overall flow: Telnyx → WebSocket → Deepgram → Grok → ElevenLabs
- [VOICE_SETUP.md](VOICE_SETUP.md) — Voice stack, env vars, audio format (mulaw 8kHz)
- [ENV_AND_SECRETS.md](ENV_AND_SECRETS.md) — All env vars and what they do
- [TELNYX_SETUP.md](TELNYX_SETUP.md) — Telnyx setup, webhooks, DID provisioning
- [CRON.md](CRON.md) — Cron endpoints and schedule

## Plan IDs and Pricing

From [app/lib/plans.ts](../app/lib/plans.ts):

| Plan ID   | Name          | Price   | Included Minutes |
|-----------|---------------|---------|------------------|
| `starter` | Starter       | $69/mo  | 300              |
| `pro`     | Pro           | $149/mo | 800              |
| `business`| Business      | $249/mo | 1500             |
| `payg`    | Pay As You Go | $0.20/min | 0              |

## Mobile API Endpoints

All mobile endpoints require `Authorization: Bearer <access_token>` (Supabase session access token) unless noted.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/mobile/checkout` | Create Stripe Checkout URL. Body: `{ plan_id?, return_scheme? }` |
| POST | `/api/mobile/billing-portal` | Create Stripe Billing Portal URL. Body: `{ return_scheme? }` |
| GET | `/api/mobile/google-auth-url?return_to=` | Get Google OAuth URL for calendar. Use `return_to=mobile` for app redirect |
| POST | `/api/mobile/sync-session` | Sync subscription from Stripe Checkout. Body: `{ session_id }` |
| POST | `/api/mobile/receptionists/create` | Create receptionist (wizard payload) |
| GET | `/api/mobile/receptionists/[id]` | Get receptionist |
| PATCH | `/api/mobile/receptionists/[id]` | Update receptionist (payment_settings, extra_instructions) |
| POST | `/api/mobile/receptionists/[id]/delete` | Delete receptionist |
| POST | `/api/mobile/receptionists/[id]/website` | Fetch website content and save. Body: `{ url }` |
| GET | `/api/mobile/receptionists/[id]/prompt-preview?compact=true` | Get prompt preview |
| POST | `/api/mobile/settings/plan-split` | Update inbound/outbound %. Body: `{ inbound_percent }` |
| PATCH | `/api/mobile/settings/business` | Update business. Body: `{ business_name?, business_address? }` |
| GET | `/api/quota-check` | Check outbound minutes (Bearer supported) |
| POST | `/api/telnyx/outbound` | Initiate outbound call. Body: `{ receptionist_id, to }` (Bearer supported) |

## Deep Link Schemes

- `echodesk://checkout?session_id=...` — Stripe Checkout success return
- `echodesk://checkout?cancelled=1` — Stripe Checkout cancel
- `echodesk://google-callback?success=1` — Google OAuth success
- `echodesk://google-callback?success=0&error=...` — Google OAuth error
- `echodesk://settings` — Billing portal return (optional)

Configure `MOBILE_REDIRECT_SCHEME` (default: `echodesk`) in backend env to override.

## Flutter Env Vars

Pass via `--dart-define` when running:

```
--dart-define=API_BASE_URL=https://your-api.com
--dart-define=SUPABASE_URL=https://xxx.supabase.co
--dart-define=SUPABASE_ANON_KEY=your_anon_key
--dart-define=DEEP_LINK_SCHEME=echodesk
```

## Google OAuth for Mobile

1. Add redirect URI in Google Cloud Console: `https://your-api.com/api/google/callback` (same as web).
2. Mobile calls `GET /api/mobile/google-auth-url?return_to=mobile`.
3. Mobile opens the returned URL in browser.
4. User authorizes; Google redirects to backend callback.
5. Backend saves tokens and redirects to `echodesk://google-callback?success=1`.

## Running the Flutter App

```bash
cd mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://localhost:3000 \
  --dart-define=SUPABASE_URL=... \
  --dart-define=SUPABASE_ANON_KEY=...
```

For production builds, use your deployed API URL.

## Internal Beta Builds

See [mobile/BETA_BUILD.md](../mobile/BETA_BUILD.md) for:
- Android APK build and distribution
- iOS TestFlight setup
- End-to-end validation checklist (signup → checkout → receptionist → outbound call)
