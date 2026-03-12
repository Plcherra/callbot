# Telnyx 90046 – Bulletproof Fix: Call Answered → Full Pipeline

**Goal:** Every inbound call answers and flows through the full voice pipeline (Deepgram STT → Grok LLM → ElevenLabs TTS → Telnyx media).

**90046 = "Media Streaming failed – Failed to connect to destination"**  
Telnyx cannot establish the WebSocket to your stream URL. This doc and script fix every known cause.

---

## The Chain (Where It Can Break)

```
Caller → Telnyx → Webhook (POST) → Python answers → Telnyx connects WebSocket → Pipeline runs
  1         2            3                4                    5                     6
```

- **1–3:** Call rings, webhook received
- **4:** Call answered (you see "Answered call" in logs)
- **5:** WebSocket connection (if this fails → 90046)
- **6:** Pipeline: Deepgram, Grok, ElevenLabs, audio back to caller

---

## Run the Bulletproof Script

On the VPS, from project root:

```bash
./deploy/scripts/fix-90046-bulletproof.sh
```

The script checks and fixes everything in order. Then place a test call and verify:

```bash
pm2 logs callbot-voice --lines 100
```

**Success looks like:**
- `[asgi] WebSocket scope received path=/api/voice/stream`
- `[voice/stream] Accepting WebSocket`
- `[voice/stream] WebSocket accepted, entering handler`
- `Stream started for <call_id>`
- No 403, no 90046

---

## All 90046 Causes & Fixes

### 1. Stream URL Through Cloudflare (most common)

**Symptom:** Webhook 200 OK, call answered, WebSocket 403, 90046.

**Cause:** Cloudflare can block or alter WebSocket upgrades (WAF, Bot Fight Mode, proxy). Telnyx must connect **directly** to your server for media.

**Fix:** Use a dedicated stream subdomain with **DNS-only** (no proxy):

1. **DNS:** `stream.echodesk.us` A record → VPS IP. In Cloudflare: **gray cloud** (DNS only).
2. **SSL:** Add to cert: `sudo certbot certonly --webroot -w /var/www/html -d stream.echodesk.us --expand`
3. **Env:**
   ```
   TELNYX_WEBHOOK_BASE_URL=https://echodesk.us
   TELNYX_STREAM_BASE_URL=https://stream.echodesk.us
   ```
4. **Restart:** `pm2 delete callbot-voice && pm2 start ecosystem.config.cjs`

---

### 2. PM2 Not Reloading Env

**Symptom:** You changed `.env` but behavior didn’t change.

**Cause:** `pm2 restart` does not reload `.env`. Only `delete` + `start` does.

**Fix:**
```bash
pm2 delete callbot-voice
pm2 start ecosystem.config.cjs
pm2 save
```

---

### 3. Nginx Missing /api/voice/ or WebSocket Headers

**Symptom:** WebSocket 403 or connection refused.

**Cause:** Nginx must proxy `/api/voice/` to port 8000 with Upgrade and Connection headers.

**Fix:** Sync from template:
```bash
cd ~/apps/callbot
sed "s|{{LANDING_ROOT}}|$(pwd)/landing/dist|g" deploy/nginx/callbot.conf.template | sudo tee /etc/nginx/sites-available/callbot
sudo ln -sf /etc/nginx/sites-available/callbot /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Or: `./deploy/scripts/sync-nginx-config.sh`

**Required in location ^~ /api/voice/:**
- `proxy_pass http://127.0.0.1:8000`
- `proxy_http_version 1.1`
- `proxy_set_header Upgrade $http_upgrade`
- `proxy_set_header Connection "upgrade"`
- `proxy_read_timeout 3600s` and `proxy_send_timeout 3600s`

---

### 4. Nginx HTTP-Only (No 443)

**Symptom:** Connection refused to `wss://stream.echodesk.us`.

**Cause:** Nginx only listens on 80; Telnyx needs 443 for WSS.

**Fix:** Use full SSL config. Ensure SSL cert exists and sync:
```bash
sudo certbot certonly --webroot -w /var/www/html -d echodesk.us -d www.echodesk.us -d stream.echodesk.us --expand
./deploy/scripts/sync-nginx-config.sh
```

---

### 5. stream.echodesk.us Not in nginx server_name

**Symptom:** 404 or wrong server block for stream host.

**Fix:** `server_name` must include `stream.echodesk.us`:
```
server_name echodesk.us www.echodesk.us stream.echodesk.us;
```

---

### 6. Firewall Blocks 443

**Symptom:** Connection timeout from outside.

**Fix:**
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
```

---

### 7. Old Code (Reject Before Accept)

**Symptom:** 403, no `[voice/stream] Accepting WebSocket` in logs.

**Cause:** Old handler rejected WebSocket before calling `accept()`.

**Fix:** Pull latest and restart:
```bash
git pull
pm2 delete callbot-voice && pm2 start ecosystem.config.cjs
```
Check logs for: `[startup] Voice backend v2026-03-stream-fix`

---

### 8. Duplicate WebSocket Rejection

**Symptom:** "Rejecting duplicate WebSocket" in logs, 403.

**Cause:** Telnyx may retry; old code rejected duplicates.

**Fix:** Current code accepts first, ignores duplicates. Ensure latest code is deployed.

---

### 9. Voice API Keys Missing

**Symptom:** WebSocket connects, then closes with 1011 "Server misconfiguration".

**Cause:** `DEEPGRAM_API_KEY`, `GROK_API_KEY`, or `ELEVENLABS_API_KEY` not set.

**Fix:** Add to `.env`:
```
DEEPGRAM_API_KEY=...
GROK_API_KEY=...
ELEVENLABS_API_KEY=...
```

---

### 10. Webhook Verification 403

**Symptom:** Telnyx webhook returns 403; call never answers.

**Cause:** `TELNYX_PUBLIC_KEY` wrong/missing, or proxy strips headers.

**Fix:** Telnyx Portal → Account → Public Key → set `TELNYX_PUBLIC_KEY`.  
If using Cloudflare Tunnel: `TELNYX_SKIP_VERIFY=1` and optionally `TELNYX_ALLOWED_IPS`.

---

### 11. callbot-voice Not Running

**Symptom:** Port 8000 not listening.

**Fix:**
```bash
pm2 start ecosystem.config.cjs
pm2 save
```

---

### 12. Wrong Telnyx Webhook URL

**Symptom:** No activity in logs when calling.

**Fix:** Telnyx Portal → Voice API Applications → Event Webhook URL = `https://echodesk.us/api/telnyx/voice`

---

## Verification Checklist

| Check | Command | Expected |
|-------|---------|----------|
| PM2 running | `pm2 list` | callbot-voice online |
| Port 8000 | `curl -s http://127.0.0.1:8000/api/health` | `{"status":"ok"...}` |
| Webhook | `curl -s -X POST https://echodesk.us/api/telnyx/voice -H "Content-Type: application/json" -d '{}'` | JSON, not HTML |
| Stream reachable | `curl -sI https://stream.echodesk.us/api/health` | HTTP 200 or 405 (HEAD may 405) |
| Env | `grep TELNYX_STREAM_BASE_URL .env` | `https://stream.echodesk.us` |
| Nginx voice | `grep -A3 "api/voice" /etc/nginx/sites-enabled/callbot` | `proxy_pass` + Upgrade |

---

## Debug Log Flow

On a successful call you should see in order:

1. `[asgi] WebSocket scope received path=/api/voice/stream qs=...`
2. `[voice/stream] Accepting WebSocket for ...`
3. `[voice/stream] WebSocket accepted, entering handler`
4. `Stream started for <call_id>`
5. No 403, no 90046

If you see (1) but not (2): routing rejects before handler – check for middleware or route ordering.  
If you see neither (1) nor (2): request never reaches Python – check nginx, DNS, firewall.

---

<<<<<<< HEAD
=======
## Full-Chain Verification (echodesk.us → Deepgram → Grok)

After applying fixes, verify the entire pipeline:

| Step | Check | Expected |
|------|-------|----------|
| 1 | **echodesk.us loads** | Open https://echodesk.us in browser — no ERR_TOO_MANY_REDIRECTS |
| 2 | **Webhook reachable** | `curl -s -X POST https://echodesk.us/api/telnyx/voice -H "Content-Type: application/json" -d '{}'` | JSON response |
| 3 | **Call answered** | `pm2 logs callbot-voice` during test call | `Answered call <id>` |
| 4 | **Stream URL** | Same logs | `Stream URL for <id>: wss://stream.echodesk.us/...` |
| 5 | **WebSocket accepted** | Same logs | `[asgi] WebSocket scope received`, `[voice/stream] Accepting WebSocket`, `Stream started for <id>` |
| 6 | **Deepgram usage** | Deepgram dashboard | New usage after test call |
| 7 | **Grok invoked** | `pm2 logs callbot-voice` when user speaks | LLM/Grok activity in logs |

If steps 1–2 fail: nginx or tunnel config. If 3–5 fail: WebSocket 403/90046 — run `fix-90046-bulletproof.sh`. If 6–7 fail: pipeline keys or init error.

---

>>>>>>> 40009df (new version)
## Quick Recovery

```bash
cd ~/apps/callbot
./deploy/scripts/fix-90046-bulletproof.sh
pm2 delete callbot-voice && pm2 start ecosystem.config.cjs
# Place test call, then:
pm2 logs callbot-voice --lines 80
```
