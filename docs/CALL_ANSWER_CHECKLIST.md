# Call Answer Checklist – 403 Forbidden and Call Flow

Use this checklist when calls ring but don't answer, or when you see `403 Forbidden` / `invalid_signature` in logs.

---

## 1. Webhook verification (403 Forbidden fix)

**Symptom:** `Telnyx webhook verification failed: strategy=ed25519 outcome=invalid_signature`

**Cause:** Ed25519 signature verification fails when the request body is modified by a proxy (Cloudflare, nginx) or when `TELNYX_PUBLIC_KEY` doesn't match.

### Option A: Use TELNYX_SKIP_VERIFY (quick fix)

When using Cloudflare Tunnel or a proxy that modifies requests:

1. On VPS, edit `.env` or `.env.local`:
   ```bash
   TELNYX_SKIP_VERIFY=1
   ```

2. **(Optional)** Restrict by IP for safety:
   ```bash
   # Comma-separated IPs that can send webhooks (e.g. Cloudflare, or leave empty to accept all when skip is on)
   TELNYX_ALLOWED_IPS=
   ```
   If empty, all requests are accepted when `TELNYX_SKIP_VERIFY=1`.

3. Restart:
   ```bash
   pm2 restart callbot-voice
   ```

### Option B: Fix Ed25519 verification (proper fix)

1. **Get your Telnyx public key**
   - Telnyx Portal → **Account** or **Settings** → **Public key** (base64)

2. **Set on VPS**
   ```bash
   TELNYX_PUBLIC_KEY="your_base64_public_key"
   ```

3. **Ensure the body is not modified**
   - If using Cloudflare: check that the proxy doesn't alter the body (e.g. no gzip re-encoding)
   - Disable `TELNYX_SKIP_VERIFY` or set it to `0` once Ed25519 works

---

## 2. Telnyx webhook URL

1. **Telnyx Portal** → Real-Time Communications → Voice → **Programmable Voice** → **Voice API Applications**
2. Open your app (e.g. "echodesk")
3. **Webhook URL** must be: `https://echodesk.us/api/telnyx/voice`
4. **Webhook API Version:** `API v2`
5. Save

---

## 3. Cloudflare / tunnel routing

1. **Cloudflare Tunnel** must forward `echodesk.us` to **nginx** (port 80 or 443), not directly to Python
2. **Service URL:** `http://localhost:80` (or `http://127.0.0.1:80`)
3. **Type:** HTTP (nginx serves HTTP on 80)

---

## 4. Nginx routing

1. On VPS:
   ```bash
   ./deploy/scripts/sync-nginx-config.sh
   sudo nginx -t
   ```

2. Check that `/api/telnyx/voice` and `/api/voice/` proxy to port 8000:
   ```bash
   grep -A2 "api/telnyx/voice\|api/voice" /etc/nginx/sites-enabled/callbot
   ```

3. Test:
   ```bash
   curl -s -X POST http://127.0.0.1/api/telnyx/voice -H "Host: echodesk.us" -H "Content-Type: application/json" -d '{}' | head -c 200
   ```
   - **Good:** `{"success":true}` or similar JSON
   - **Bad:** HTML or 404

---

## 5. PM2 and Python backend

1. Only `callbot-voice` should run (no `callbot` / Next.js):
   ```bash
   pm2 list
   pm2 restart callbot-voice
   pm2 save
   ```

2. Health check:
   ```bash
   curl -s http://127.0.0.1:8000/api/health
   ```
   Expected: `{"status":"ok",...}`

---

## 6. Environment variables (VPS `.env`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `TELNYX_API_KEY` | Yes | Answer calls, stream_start |
| `TELNYX_WEBHOOK_BASE_URL` | Yes | `https://echodesk.us` (not localhost) |
| `TELNYX_SKIP_VERIFY` | When proxy alters body | `1` to skip signature verification |
| `DEEPGRAM_API_KEY` | Yes | Speech-to-text |
| `GROK_API_KEY` | Yes | LLM |
| `ELEVENLABS_API_KEY` | Yes | Text-to-speech |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | DB access |

---

## 7. Receptionist and numbers

1. **Supabase** `receptionists` table: at least one row with `status = 'active'` and a `telnyx_phone_number` or `inbound_phone_number` matching your DID
2. **Telnyx Portal** → Numbers: your DID must be assigned to the same Voice API Application that has the webhook URL above

---

## 8. End-to-end call flow

1. Caller dials your DID → Telnyx receives call  
2. Telnyx `POST` to `https://echodesk.us/api/telnyx/voice` (`call.initiated`)  
3. Python: lookup receptionist, quota check, answer call, `stream_start(stream_url)`  
4. Telnyx connects WebSocket to `wss://echodesk.us/api/voice/stream`  
5. Pipeline: Deepgram STT → Grok LLM → ElevenLabs TTS → audio to caller  
6. On hangup: Telnyx `POST` to `/api/telnyx/cdr` (usage, push)

---

## 9. Quick diagnostic

```bash
# On VPS
pm2 logs callbot-voice --lines 50
./deploy/scripts/diagnose-call-flow.sh
```

Look for: `Answered call`, `Stream started`, `invalid_signature`, `403`, `No receptionist`, `quota exceeded`.
