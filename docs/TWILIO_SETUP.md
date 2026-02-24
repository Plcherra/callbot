# Twilio Setup (echodesk voice AI)

This guide covers Twilio configuration for voice and SMS webhooks, environment variables, and local testing.

## Folder Structure

```
app/
├── api/
│   └── twilio/
│       ├── voice/
│       │   └── route.ts    # POST – incoming voice (Gather/Say or Media Streams)
│       ├── sms/
│       │   └── route.ts    # POST – incoming SMS
│       └── status/
│           └── route.ts    # POST – call/stream status callbacks
├── actions/
│   └── provisionTwilioNumber.ts   # Provisions number + configures voice/sms/status URLs
└── lib/
    └── twilio.ts           # provisionNumber, configureVoiceUrl, configureSmsUrl, releaseNumber
```

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/twilio/voice` | POST | Incoming voice calls → TwiML (Gather/Say or Media Streams) |
| `/api/twilio/sms` | POST | Incoming SMS → reply TwiML |
| `/api/twilio/status` | POST | Call/stream status callbacks |

## Environment Variables

```bash
# Required for Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token

# Public base URL for webhooks (must be reachable by Twilio)
# Local: use ngrok or Cloudflare Tunnel URL
# Production: https://echodesk.us or your Vercel/Hetzner URL
TWILIO_WEBHOOK_BASE_URL=https://your-public-url.com

# Voice mode (optional, default: gather)
# - "gather": TwiML <Gather input="speech"> — no extra server, Twilio does STT
# - "streams": Media Streams WebSocket — requires self-hosted voice server
TWILIO_VOICE_MODE=gather

# For streams mode only
VOICE_SERVER_WS_URL=wss://echodesk.us/ws
VOICE_SERVER_API_KEY=optional_secret
```

## Install Dependencies

Twilio and TwiML are provided by the `twilio` package:

```bash
npm install twilio
```

The `twilio` package includes `twilio.twiml.VoiceResponse` and `twilio.twiml.MessagingResponse` — no separate `@twilio/twiml` package needed.

## Twilio Console Configuration

When you provision a number via the app, it sets:

- **Voice webhook**: `{TWILIO_WEBHOOK_BASE_URL}/api/twilio/voice`
- **SMS webhook**: `{TWILIO_WEBHOOK_BASE_URL}/api/twilio/sms`
- **Status callback**: `{TWILIO_WEBHOOK_BASE_URL}/api/twilio/status`

For manually configured numbers, set these in [Twilio Console → Phone Numbers → Manage → Active Numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming) for each number:

- **Voice** → A call comes in → Webhook: `https://your-url/api/twilio/voice`, HTTP POST
- **Messaging** → A message comes in → Webhook: `https://your-url/api/twilio/sms`, HTTP POST
- **Status callback URL**: `https://your-url/api/twilio/status`

## Local Testing

Twilio must reach your webhooks over the public internet. Use a tunnel:

### Option 1: Cloudflare Tunnel (recommended)

1. Install cloudflared: `brew install cloudflared`
2. Create a tunnel in [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → Networks → Tunnels
3. Run the tunnel pointing to `http://localhost:3000`
4. Use the tunnel URL (e.g. `https://your-tunnel.trycloudflare.com`) as `TWILIO_WEBHOOK_BASE_URL`

### Option 2: ngrok

```bash
ngrok http 3000
```

Use the HTTPS URL (e.g. `https://abc123.ngrok.io`) as `TWILIO_WEBHOOK_BASE_URL`.

### Test flow

1. Set `.env.local`:
   ```bash
   TWILIO_WEBHOOK_BASE_URL=https://your-tunnel-url
   TWILIO_VOICE_MODE=gather
   TWILIO_ACCOUNT_SID=...
   TWILIO_AUTH_TOKEN=...
   ```

2. Start the app: `npm run dev`

3. Call your Twilio number — you should hear the greeting and be able to speak. The placeholder AI will respond with static answers for "appointment", "hours", etc.

4. Send an SMS to the number — you should get a placeholder reply.

## Production (Hetzner VPS / echodesk.us)

For production backend on Hetzner:

1. Deploy your Next.js API (or a dedicated webhook server) so it’s reachable at `https://echodesk.us` (or your chosen domain).

2. Set environment variables on the server:
   ```bash
   TWILIO_WEBHOOK_BASE_URL=https://echodesk.us
   TWILIO_VOICE_MODE=gather   # or "streams" when voice server is ready
   TWILIO_ACCOUNT_SID=...
   TWILIO_AUTH_TOKEN=...
   ```

3. Ensure HTTPS and valid SSL. Twilio requires HTTPS for webhooks.

4. Update Twilio numbers to use `https://echodesk.us/api/twilio/voice`, `/api/twilio/sms`, `/api/twilio/status`.

## Voice Modes

### Gather mode (default)

- Twilio transcribes speech with `<Gather input="speech">`
- Your app receives `SpeechResult` and returns TwiML (`<Say>`, another `<Gather>`, etc.)
- No extra voice server
- Suitable for simple flows and testing

### Streams mode

- Connects to a WebSocket voice server (`VOICE_SERVER_WS_URL`)
- Uses your self-hosted pipeline (Whisper, LLM, Piper)
- Lower latency, more control
- Requires the voice server to be running and reachable
