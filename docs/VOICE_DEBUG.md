# Voice Pipeline Debug Guide

This guide helps debug the flow: **Telnyx → Deepgram → ElevenLabs → Grok → Telnyx**.

## Pipeline Overview

```
Phone call → Telnyx (webhook POST /api/telnyx/voice)
          → Python FastAPI backend answers + stream_start(stream_url)
          → Telnyx connects to WebSocket (stream_url)
          → Python backend handles /api/voice/stream
          → Deepgram (STT) → Grok (LLM) → ElevenLabs (TTS)
          → Audio sent back over WebSocket → Telnyx → Caller
```

## Critical: Run Both Next.js and Python Voice Backend

The voice pipeline runs in the **Python FastAPI backend** (port 8000). Next.js (port 3000) is the dashboard only.

- **WebSocket** at `/api/voice/stream` is handled by the Python backend
- Nginx must proxy `/api/telnyx/voice` and `/api/voice/*` to port 8000

Use the PM2 ecosystem config (runs both apps):

```bash
npm run build
pm2 delete callbot 2>/dev/null || true
pm2 delete callbot-voice 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
```

**Ensure both `callbot` and `callbot-voice` are running.** Check with `pm2 list`.

---

## Debug Checklist

### 1. Check PM2 / Services

Ensure both apps are running:

```bash
pm2 list
# Should show callbot (Next.js) and callbot-voice (Python)
pm2 logs callbot-voice --lines 30
```

### 2. TELNYX_WEBHOOK_BASE_URL Must Be Public

- Must be **reachable from the internet** (e.g. `https://echodesk.us`)
- **Not** `http://localhost` — Telnyx servers cannot reach localhost
- The stream_url becomes `wss://your-domain/api/voice/stream?...` — Telnyx connects from their cloud to this URL

### 3. WebSocket Upgrade (Reverse Proxy)

If you use nginx, Cloudflare, or another proxy:

- WebSocket requires `Upgrade: websocket` and `Connection: Upgrade`
- nginx example (see `docs/nginx-callbot-complete.conf`):

  ```nginx
  location /api/voice/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_connect_timeout 60s;
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

When a call comes in, check `pm2 logs callbot-voice`:

**When a call comes in:**
```
[telnyx/voice] Receptionist found: <id> <name>
Answered call <call_control_id>
Stream started for <call_control_id>
```

**If WebSocket connects (Telnyx reaches your server):**
```
[voice/stream] WebSocket connected
Pipeline init...
```

**If you do NOT see WebSocket connect:** Telnyx cannot reach your WebSocket. Check:

- Is `callbot-voice` running on port 8000?
- Is `TELNYX_WEBHOOK_BASE_URL` your public URL?
- Does nginx proxy `/api/voice/` to port 8000 with WebSocket upgrade?

**If you see `No receptionist for DID`:** The called number doesn't match any receptionist. Check `telnyx_phone_number` / `inbound_phone_number` in the DB.

### 6. Credits: Why Different Behavior?

- **Real phone, no credits:** Call may never be "answered" (e.g. receptionist not found, quota exceeded). Or the DID format in the webhook doesn't match your DB.
- **Virtual call (FaceTime/Skype), credits used, no AI:** Call is answered, but WebSocket fails or pipeline fails. Telnyx bills when the call is answered. Check for WebSocket connect and pipeline errors.

### 7. API Keys

Ensure these are set on the VPS (in `.env` or `.env.local` in project root):

- `DEEPGRAM_API_KEY`
- `ELEVENLABS_API_KEY`
- `GROK_API_KEY`
- `TELNYX_API_KEY`
- `TELNYX_PUBLIC_KEY` or `TELNYX_WEBHOOK_SECRET` (for webhook validation)

The Python backend loads `.env` and `.env.local` from the project root. The ecosystem config loads them via dotenv for PM2.

### 8. No Usage on Deepgram/Grok/ElevenLabs

If **none** of these APIs show usage when you make a test call, the pipeline is never running. Check:

1. **WebSocket connects?** In `pm2 logs callbot-voice`, look for pipeline/WebSocket activity.
   - If you never see it → Telnyx cannot reach your WebSocket. Check nginx proxy and `TELNYX_WEBHOOK_BASE_URL`.

2. **API keys on VPS?** The backend validates at startup. If keys are missing, it will fail to start. Add them to `.env` or `.env.local` and restart: `pm2 reload callbot-voice --update-env`

3. **Backend env** — The ecosystem config loads dotenv for `.env` and `.env.local`. Ensure those files exist on the VPS.

---

## Quick Test

1. Call your receptionist number from your phone.
2. Run `pm2 logs callbot-voice --lines 50`.
3. Look for answer + stream start. If WebSocket never connects, Telnyx cannot reach your backend.

## Direct Backend Test

```bash
# On VPS: test Python backend locally
curl -s http://127.0.0.1:8000/health

# Via nginx (should proxy to backend)
curl -s -X POST https://echodesk.us/api/telnyx/voice -H "Content-Type: application/json" -d '{}'
```

If the first works but the second returns HTML/404, nginx is not proxying to port 8000.
