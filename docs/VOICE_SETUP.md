# Voice AI Setup (Deepgram, ElevenLabs, Grok)

This document describes the voice pipeline: Telnyx + Deepgram STT + Grok LLM + ElevenLabs TTS.

## Overview

- **Phone numbers**: Telnyx provisions and manages DIDs
- **Call handling**: Telnyx webhooks route incoming calls; Next.js answers and streams to WebSocket
- **AI pipeline**: Deepgram (STT) → Grok (LLM) → ElevenLabs (TTS) — all via external APIs
- **Prompts**: Built from Supabase data, fetched via `/api/receptionist-prompt`

## Prerequisites

- Telnyx account (portal.telnyx.com)
- Deepgram API key (console.deepgram.com)
- ElevenLabs API key (elevenlabs.io)
- Grok API key (x.ai/developer)
- Next.js app deployed

## Environment Variables

```env
# Telnyx
TELNYX_API_KEY=
TELNYX_WEBHOOK_BASE_URL=https://your-app.com

# Voice AI
DEEPGRAM_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
GROK_API_KEY=

# Auth for prompt/calendar APIs
VOICE_SERVER_API_KEY=optional_secret
```

## Running the App

Use the custom server for WebSocket support:

```bash
npm run build
node server.js
```

For production, run `node server.js` (or `npm start`) via PM2. The server handles both HTTP and WebSocket at `/api/voice/stream`.

## Local Development

```bash
npm run dev   # or node server.js for WebSocket
```

Expose with ngrok or Cloudflare Tunnel. Set `TELNYX_WEBHOOK_BASE_URL` to your public URL.

## Audio Format

| Direction | Telnyx | Pipeline |
|-----------|--------|----------|
| Inbound   | mulaw 8kHz | Deepgram (mulaw 8kHz) → transcript |
| Outbound  | mulaw 8kHz | ElevenLabs (ulaw_8000) → Telnyx |

## Troubleshooting

- **No audio**: Verify DEEPGRAM_API_KEY, ELEVENLABS_API_KEY, GROK_API_KEY
- **WebSocket not connecting**: Use `node server.js`, not `next start`
- **Prompt not loading**: Verify VOICE_SERVER_API_KEY and x-voice-server-key header
- **Call usage not recorded**: Configure Telnyx CDR webhook to `/api/telnyx/cdr`
