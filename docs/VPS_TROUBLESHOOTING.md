# VPS Troubleshooting: Calls & Server Actions

## "When I call nothing happens"

**Calls are handled by the Python FastAPI backend.** Only `callbot-voice` (PM2) runs; no Next.js.

### 1. Is the Python voice backend running?

The voice pipeline (Telnyx webhook, Deepgram, Grok, ElevenLabs) lives in `backend/`. It must run on port 8000.

**Option A: Use ecosystem.config.cjs (runs callbot-voice)**

```bash
cd ~/apps/callbot
pm2 delete callbot 2>/dev/null; pm2 delete callbot-voice 2>/dev/null
pm2 start ecosystem.config.cjs
pm2 save
```

**Option B: Start voice backend separately**

```bash
cd ~/apps/callbot
./venv/bin/pip install -r backend/requirements.txt
pm2 start "./venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000" --name callbot-voice --cwd .
pm2 save
```

Verify both are running: `pm2 status` should show `callbot` and `callbot-voice` online.

### 2. Where does Telnyx send the webhook?

Telnyx sends `call.initiated` to `TELNYX_WEBHOOK_BASE_URL/api/telnyx/voice`.

- If `TELNYX_WEBHOOK_BASE_URL=https://echodesk.us`, nginx must proxy `/api/telnyx/voice` and `/api/voice/stream` (WebSocket) to the Python backend on port 8000.
- Or use a subdomain: `TELNYX_WEBHOOK_BASE_URL=https://voice.echodesk.us` and point that subdomain to port 8000.

### 3. Example nginx config (same domain)

These `location` blocks must come **before** any general `proxy_pass` to port 3000. Add inside your `server { ... }` for echodesk.us:

```nginx
# Proxy voice routes to Python backend (port 8000)
location /api/telnyx/voice {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

location /api/voice/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

### 3b. Quick diagnostics

```bash
# 1. Test voice backend directly on the VPS
curl -s http://127.0.0.1:8000/health

# 2. Test via nginx (from VPS or your machine)
curl -s https://echodesk.us/api/telnyx/voice -X POST -H "Content-Type: application/json" -d '{}'

# 3. Check nginx config
sudo cat /etc/nginx/sites-enabled/* | grep -A5 "telnyx/voice"
```

- If (1) works but (2) returns 404 → nginx is not proxying to 8000.
- If (2) returns 200 or 403 → nginx is correct; check Telnyx Portal webhook URL.

### 4. Telnyx Portal

In Telnyx Portal → Connections → your Voice connection → Event Webhook URL must be:

- `https://echodesk.us/api/telnyx/voice` (if using same-domain proxy)

or

- `https://voice.echodesk.us/api/telnyx/voice` (if using subdomain)

### 5. Python backend env

The backend needs its own `.env` (e.g. `backend/.env` or project root) with:

- `TELNYX_API_KEY`, `TELNYX_WEBHOOK_SECRET`, `TELNYX_WEBHOOK_BASE_URL`
- `DEEPGRAM_API_KEY`, `GROK_API_KEY`, `ELEVENLABS_API_KEY`
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL` = base URL (e.g. `https://echodesk.us`) for redirects, FCM
- `INTERNAL_API_KEY` = (legacy; backend is self-contained)

---

## PM2 and env loading

PM2 must load `.env` and `.env.local`. Use the project's `ecosystem.config.cjs`:

```bash
pm2 start ecosystem.config.cjs
```

This loads env via dotenv and starts `callbot-voice` (Python backend). No Next.js.

### Mobile app cache

After backend changes, users may need to restart the Flutter app or clear app data to pick up changes.
