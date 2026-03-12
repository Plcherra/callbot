# VPS Troubleshooting: Calls & Server Actions

## "When I call nothing happens"

**Calls are handled by the Python FastAPI backend, not Next.js.** Next.js (PM2 `callbot`) is the dashboard only. You need both running.

### 1. Is the Python voice backend running?

The voice pipeline (Telnyx webhook, Deepgram, Grok, ElevenLabs) lives in `backend/`. It must run on port 8000.

**Option A: Use ecosystem.config.cjs (runs both Next.js and voice)**

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
- `APP_API_BASE_URL` = Next.js URL (e.g. `https://echodesk.us`) for FCM push
- `INTERNAL_API_KEY` = shared secret with Next.js

---

## "Failed to find Server Action" errors

### 1. Env at build time

`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` must be set **before** `npm run build`:

**Option A: Use the setup script (recommended)**

```bash
./deploy/scripts/setup-server-actions-key.sh
npm run build
pm2 restart callbot
```

**Option B: Manual**

```bash
# Generate key
openssl rand -base64 32

# Add to .env (in project root, where you run npm run build)
echo 'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<paste_output_above>' >> .env
npm run build
```

The deploy script (`deploy/scripts/deploy.sh`) will fail with clear instructions if the key is missing.

### 2. PM2 must load .env

If you use a `.env` file, PM2 does not load it by default. Options:

**Option A: Use ecosystem config**

The project includes `ecosystem.config.cjs` which loads `.env` and `.env.local` and runs both Next.js and the voice backend:

```bash
pm2 start ecosystem.config.cjs
```

**Option B: dotenv-cli**

```bash
npm install -g dotenv-cli
pm2 start "dotenv -e .env -- npm run start" --name callbot
```

### 3. Hard refresh

After redeploying, users with old cached pages may still see the error. Ask them to hard refresh (Ctrl+Shift+R) or clear cache.
