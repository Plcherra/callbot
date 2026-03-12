# Troubleshooting

Common errors and what fixed them. Cursor can use this to avoid suggesting already-tried wrong fixes.

## Pre-start validation

Before debugging, run the infrastructure validation script:

```bash
./deploy/scripts/validate-infra-before-start.sh
```

It checks Cloudflare Tunnel, nginx, Telnyx config, env vars, and PM2/ports. Use `--fix` to attempt auto-corrections. See [VALIDATION_SCRIPT.md](VALIDATION_SCRIPT.md).

## Incoming calls not answered / No activity in PM2 logs

**Symptom:** Caller dials DID, nothing happens. Mobile shows "Voice: Connected" and "No calls yet". No activity when checking PM2 logs.

**First steps:**
1. **Check the right logs:** Voice events go to `pm2 logs callbot-voice`, not `pm2 logs callbot`.
2. **Run diagnostics:** `./deploy/scripts/diagnose-call-flow.sh` (on VPS from project root)
3. **Full audit:** See [CALL_FLOW_DIAGNOSTIC.md](CALL_FLOW_DIAGNOSTIC.md) for end-to-end flow, failure points, and fixes

Common causes (in order): nginx routes `/api/telnyx/voice` to Next.js (returns HTML); callbot-voice not running; `TELNYX_WEBHOOK_BASE_URL` missing or set to localhost.

## Nginx 404 / HTML when hitting /api/telnyx/voice

**Symptom:** `curl -X POST https://echodesk.us/api/telnyx/voice -d '{}'` returns HTML (Next.js 404) instead of JSON.

**Cause:** Nginx is not proxying `/api/telnyx/voice` to port 8000; request hits Next.js instead.

**Fixes:**
1. Use `location ^~ /api/telnyx/voice` and `location ^~ /api/voice/` — the `^~` modifier forces highest priority so requests don't fall through to `location /`
2. Voice `location` blocks must come **before** `location /` in nginx config
3. Check: `sudo nginx -t` — syntax errors prevent config load
4. Check: `sudo ls /etc/nginx/sites-enabled/` — callbot config must be symlinked
5. Restart: `sudo systemctl reload nginx`
6. See `docs/nginx-explained.md` for correct config (use `^~` on API locations)

## Cert path not found (/etc/letsencrypt/live/echodesk.us)

**Symptom:** nginx fails to start: `cannot load certificate ... No such file or directory`.

**Fixes:**

**Option A: Get the cert first (recommended)**
```bash
sudo systemctl stop nginx
sudo certbot certonly --standalone -d echodesk.us -d www.echodesk.us --agree-tos -m your@email.com
sudo cp deploy/nginx/callbot.conf.template /etc/nginx/sites-available/callbot
sudo nginx -t && sudo systemctl start nginx
```

**Option B: Use HTTP-only config until cert exists**
```bash
sudo cp deploy/nginx/callbot-http-only.conf.template /etc/nginx/sites-available/callbot
sudo ln -sf /etc/nginx/sites-available/callbot /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl start nginx
```
App will work over HTTP. Get cert later with Option A, then switch to `callbot.conf.template`.

## pip install: externally-managed-environment (PEP 668)

**Symptom:** `pip3 install -r backend/requirements.txt` fails with "This environment is externally managed".

**Cause:** Debian/Ubuntu blocks system-wide pip installs (PEP 668).

**Fix:** Use a virtual environment:
```bash
python3 -m venv venv
./venv/bin/pip install -r backend/requirements.txt
```
The `backend/start.sh` automatically activates the venv when present. If `python3 -m venv` fails, install: `sudo apt install python3-venv`.

## Uvicorn / callbot-voice not running

**Symptom:** PM2 shows only `callbot`; no `callbot-voice`. Port 8000 not listening.

**Cause:** Deploy or manual start only ran Next.js, not the voice backend.

**Fixes:**
1. `pm2 start ecosystem.config.cjs` (runs both callbot and callbot-voice)
2. Or manually: `pm2 start "python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000" --name callbot-voice`
3. Verify: `curl http://127.0.0.1:8000/health`
4. Ensure deploy pipeline includes callbot-voice (see deployment.md)

## "Failed to find Server Action"

**Symptom:** Dashboard actions fail after deploy.

**Cause:** `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` not set before build, or PM2 not loading env.

**Fixes:**
1. Generate: `openssl rand -base64 32`
2. Add to `.env` or `.env.local` **before** `npm run build`
3. Rebuild and redeploy
4. Use ecosystem config that loads dotenv; or `pm2 reload callbot --update-env`
5. Users: hard refresh (Ctrl+Shift+R) to clear cached pages

## Calls answered but no AI / no audio

**Symptom:** Call connects, no speech from AI.

**Causes:**
- WebSocket never reaches backend (Telnyx can't connect)
- Missing API keys (Deepgram, Grok, ElevenLabs)

**Fixes:**
1. Check `pm2 logs callbot-voice` for WebSocket connect and pipeline errors
2. `TELNYX_WEBHOOK_BASE_URL` must be public (https://echodesk.us), not localhost
3. nginx `location /api/voice/` needs `Upgrade` and `Connection` headers for WebSocket
4. Backend validates keys at startup; if missing, it fails — add to .env, restart

## Call answered but silence (WebSocket 403)

**Symptom:** Call picks up but no audio. Logs: `WebSocket /api/voice/stream 403`, `Stream start failed: Failed to connect to destination`.

**Cause:** Telnyx cannot connect to the WebSocket stream. Often due to nginx not routing `/api/voice/` to Python, or Cloudflare Tunnel blocking WebSockets.

**Fixes:**
1. Run `./deploy/scripts/fix-nginx-voice.sh` so nginx proxies `/api/voice/` to port 8000.
2. If using Cloudflare Tunnel: add `TELNYX_STREAM_BASE_URL=https://your-vps-ip-or-direct-domain` (a URL Telnyx can reach without the tunnel). See [CALL_FLOW_DIAGNOSTIC.md](CALL_FLOW_DIAGNOSTIC.md#8-call-answered-but-silence-websocket-403--stream-failed).

## Telnyx 403 Forbidden on webhook

**Symptom:** Telnyx sends webhook, we return 403.

**Verification precedence chain** (in order):

1. **Ed25519** — Preferred. Requires `TELNYX_PUBLIC_KEY` and headers `telnyx-signature-ed25519` + `telnyx-timestamp`.
2. **Skip verification** — Only when headers are stripped by proxy (e.g. Cloudflare Tunnel). Set `TELNYX_SKIP_VERIFY=1`. **Use `TELNYX_ALLOWED_IPS` for defense-in-depth.**
3. **HMAC fallback** — Legacy. Requires `TELNYX_WEBHOOK_SECRET` and header `x-telnyx-signature` (or `t-signature`).

**Fixes:**

1. Set `TELNYX_PUBLIC_KEY` (Ed25519 from Portal) or `TELNYX_WEBHOOK_SECRET` for signature verification. See [TELNYX_SETUP.md](TELNYX_SETUP.md).
2. **Behind Cloudflare / proxy:** If headers `telnyx-signature-ed25519` and `telnyx-timestamp` are stripped, verification fails. Options:
   - **Preferred:** Fix header forwarding in nginx/Cloudflare so Telnyx headers are passed through.
   - **Fallback:** Set `TELNYX_SKIP_VERIFY=1` to accept without verification. Less secure; **always set `TELNYX_ALLOWED_IPS`** (comma-separated Telnyx outbound IPs) for defense-in-depth.
3. **Rate limiting (429):** After 10 failed verification attempts per IP in 60 seconds, we return 429. Wait ~60s before retrying. Ensure correct signature and headers.

**Nginx:** To forward Telnyx headers, use `proxy_pass_request_headers on` (default) and avoid stripping `telnyx-*` headers.
