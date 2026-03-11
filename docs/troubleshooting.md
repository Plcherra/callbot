# Troubleshooting

Common errors and what fixed them. Cursor can use this to avoid suggesting already-tried wrong fixes.

## Nginx 404 / HTML when hitting /api/telnyx/voice

**Symptom:** `curl -X POST https://echodesk.us/api/telnyx/voice -d '{}'` returns HTML (Next.js 404) instead of JSON.

**Cause:** Nginx is not proxying `/api/telnyx/voice` to port 8000; request hits Next.js instead.

**Fixes:**
1. Voice `location` blocks must come **before** `location /` in nginx config
2. Check: `sudo nginx -t` — syntax errors prevent config load
3. Check: `sudo ls /etc/nginx/sites-enabled/` — callbot config must be symlinked
4. Restart: `sudo systemctl reload nginx`
5. See `docs/nginx-explained.md` for correct config

## Cert path not found (/etc/letsencrypt/live/echodesk.us)

**Symptom:** nginx fails to start, cert path missing.

**Fixes:**
1. Obtain cert: `sudo certbot certonly --nginx -d echodesk.us -d www.echodesk.us`
2. Or adjust `ssl_certificate` path in nginx config if using different cert location
3. Renew: `./deploy/scripts/renew-cert.sh`

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

## Telnyx 403 Forbidden on webhook

**Symptom:** Telnyx sends webhook, we return 403.

**Fix:** Set `TELNYX_PUBLIC_KEY` (Ed25519 from Portal) or `TELNYX_WEBHOOK_SECRET` for signature verification. See telnyx-integration.md.
