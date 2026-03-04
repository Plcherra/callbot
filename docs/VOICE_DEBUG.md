# Voice Pipeline Debug Guide

This guide helps debug the flow: **Telnyx → Deepgram → ElevenLabs → Grok → Telnyx**.

## Pipeline Overview

```
Phone call → Telnyx (webhook POST /api/telnyx/voice)
          → Next.js answers + stream_start(stream_url)
          → Telnyx connects to WebSocket (stream_url)
          → server.js handles /api/voice/stream
          → Deepgram (STT) → Grok (LLM) → ElevenLabs (TTS)
          → Audio sent back over WebSocket → Telnyx → Caller
```

## Critical: Run `node server.js` (Not `next start`)

The WebSocket at `/api/voice/stream` is **only** available when running the custom server:

```bash
npm run build
node server.js
```

Or with PM2: `pm2 start server.js --name callbot` (or `pm2 start npm --name callbot -- start`)

**Using `next start` alone will not enable WebSockets.** Telnyx will receive the stream_url but fail to connect.

---

## Debug Checklist

### 1. Check PM2 / Server

Ensure you're running the custom server:

```bash
pm2 list
# Should show server.js or npm start, not next start
```

### 2. TELNYX_WEBHOOK_BASE_URL Must Be Public

- Must be **reachable from the internet** (e.g. `https://echodesk.us`)
- **Not** `http://localhost` — Telnyx servers cannot reach localhost
- The stream_url becomes `wss://your-domain/api/voice/stream?...` — Telnyx connects from their cloud to this URL

### 3. WebSocket Upgrade (Reverse Proxy)

If you use nginx, Cloudflare, or another proxy:

- WebSocket requires `Upgrade: websocket` and `Connection: Upgrade`
- nginx example:
  ```nginx
  location /api/voice/stream {
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_pass http://localhost:3000;
  }
  ```

### 4. Receptionist Lookup

The webhook looks up the receptionist by **our DID** (the number being called):

- `telnyx_phone_number` or `inbound_phone_number` in `receptionists` must match
- Formats are normalized (E.164, +1, 10-digit). Check Supabase:

```sql
SELECT id, name, telnyx_phone_number, inbound_phone_number, status
FROM receptionists WHERE status = 'active';
```

### 5. Interpret PM2 Logs

With the added debug logging, you should see:

**When a call comes in:**
```
[telnyx/voice] Event: call.initiated
[telnyx/voice] Payload: to= +1... from= +1... ourDid= +1... direction= inbound
[telnyx/voice] Receptionist found: <id> <name>
[telnyx/voice] streamUrl= wss://echodesk.us/api/voice/stream?...
[telnyx/voice] Answered and stream_start OK for <call_control_id>
```

**If WebSocket connects (Telnyx reaches your server):**
```
[voice/stream] WebSocket connected { receptionist_id: ..., call_sid: ..., direction: ... }
[voice/stream] Pipeline init: greeting len= ...
[voice/stream] Pipeline ready, playing greeting
```

**If you do NOT see `[voice/stream] WebSocket connected`:** Telnyx cannot reach your WebSocket. Check:
- Are you running `node server.js`?
- Is `TELNYX_WEBHOOK_BASE_URL` your public URL?
- Does your reverse proxy allow WebSocket upgrade?

**If you see `No receptionist for DID`:** The called number doesn't match any receptionist. Check `telnyx_phone_number` / `inbound_phone_number` in the DB.

### 6. Credits: Why Different Behavior?

- **Real phone, no credits:** Call may never be "answered" (e.g. receptionist not found, we return before `answer`). Or the DID format in the webhook doesn't match your DB.
- **Virtual call (FaceTime/Skype), credits used, no AI:** Call is answered, but WebSocket fails or pipeline fails. Telnyx bills when the call is answered. Check for `[voice/stream] WebSocket connected` and pipeline errors.

### 7. API Keys

Ensure these are set on the VPS (in `.env.local` or PM2 env):

- `DEEPGRAM_API_KEY`
- `ELEVENLABS_API_KEY`
- `GROK_API_KEY`
- `TELNYX_API_KEY`
- `TELNYX_PUBLIC_KEY` or `TELNYX_WEBHOOK_SECRET` (for webhook validation)

### 8. Bug Fix Applied

A bug in `app/lib/receptionistByPhone.ts` was fixed: `for (const v of unique)` → `for (const v of variants)`. The old code would throw `ReferenceError` and break receptionist lookup. Redeploy to pick up the fix.

---

## Quick Test

1. Call your receptionist number from your phone.
2. Run `pm2 logs callbot --lines 50`.
3. Look for the sequence above. If `[voice/stream] WebSocket connected` never appears, Telnyx cannot reach your WebSocket.
