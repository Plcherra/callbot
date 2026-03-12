#!/bin/bash
# Bulletproof 90046 fix: check and fix every known cause.
# Run on VPS from project root: ./deploy/scripts/fix-90046-bulletproof.sh
#
# Goal: Call answered → WebSocket connected → full pipeline (Deepgram → Grok → ElevenLabs).
# See docs/90046-BULLETPROOF-FIX.md for full reference.

set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

DOMAIN="${DOMAIN:-echodesk.us}"
STREAM_HOST="${STREAM_HOST:-stream.$DOMAIN}"
VPS_IP="${VPS_IP:-}"

echo "=============================================="
echo "  90046 Bulletproof Fix"
echo "  Domain: $DOMAIN | Stream: $STREAM_HOST"
echo "=============================================="
echo ""

FIXED=0
WARNINGS=()

# --- 1. PM2 / callbot-voice ---
echo "--- 1. PM2 (callbot-voice) ---"
if ! pm2 list 2>/dev/null | grep -q "callbot-voice.*online"; then
  echo "  Starting callbot-voice..."
  pm2 delete callbot-voice 2>/dev/null || true
  pm2 start ecosystem.config.cjs
  pm2 save
  FIXED=1
  echo "  OK: Started"
else
  echo "  OK: callbot-voice online"
fi
echo ""

# --- 2. Port 8000 ---
echo "--- 2. Backend (port 8000) ---"
if ! curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/health 2>/dev/null | grep -q "200\|503"; then
  echo "  WARN: Backend not responding on 8000"
  WARNINGS+=("Backend not reachable. Run: pm2 start ecosystem.config.cjs")
else
  echo "  OK: Backend responding"
fi
echo ""

# --- 3. Env: TELNYX_STREAM_BASE_URL ---
echo "--- 3. Env (TELNYX_STREAM_BASE_URL) ---"
if [ ! -f .env ] && [ ! -f .env.local ]; then
  echo "  WARN: No .env or .env.local"
  WARNINGS+=("Create .env with TELNYX_STREAM_BASE_URL=https://$STREAM_HOST")
else
  STREAM_URL=$(grep -hE "^TELNYX_STREAM_BASE_URL=" .env .env.local 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  WEBHOOK_URL=$(grep -hE "^TELNYX_WEBHOOK_BASE_URL=" .env .env.local 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  if [ -z "$(echo "$STREAM_URL" | tr -d '[:space:]')" ]; then
    echo "  Adding TELNYX_STREAM_BASE_URL=https://$STREAM_HOST to .env"
    [ -f .env ] || touch .env
    echo "" >> .env
    echo "# Stream URL for Telnyx media (direct to VPS, bypass Cloudflare)" >> .env
    echo "TELNYX_STREAM_BASE_URL=https://$STREAM_HOST" >> .env
    FIXED=1
    echo "  OK: Added"
  else
    echo "  OK: TELNYX_STREAM_BASE_URL=$STREAM_URL"
  fi
  if [ -z "$WEBHOOK_URL" ]; then
    echo "  WARN: TELNYX_WEBHOOK_BASE_URL not set"
    WARNINGS+=("Set TELNYX_WEBHOOK_BASE_URL=https://$DOMAIN in .env")
  fi
fi
echo ""

# --- 4. Nginx /api/voice/ ---
echo "--- 4. Nginx /api/voice/ ---"
NGINX_CONF="/etc/nginx/sites-available/callbot"
if [ ! -f "$NGINX_CONF" ]; then
  NGINX_CONF="/etc/nginx/sites-enabled/callbot"
fi
if [ -f "$NGINX_CONF" ]; then
  if grep -A5 "api/voice" "$NGINX_CONF" 2>/dev/null | grep -q "proxy_pass"; then
    if grep -A5 "api/voice" "$NGINX_CONF" 2>/dev/null | grep -q "Upgrade"; then
      echo "  OK: Nginx proxies /api/voice/ with WebSocket headers"
    else
      echo "  WARN: Nginx has /api/voice/ but missing Upgrade/Connection"
      WARNINGS+=("Add Upgrade and Connection headers to nginx location ^~ /api/voice/")
    fi
  else
    echo "  Syncing nginx from template..."
    LANDING="$ROOT/landing/dist"
    [ ! -d "$LANDING" ] && LANDING="/var/www/html"
    sed "s|{{LANDING_ROOT}}|$LANDING|g" deploy/nginx/callbot.conf.template | sudo tee /etc/nginx/sites-available/callbot > /dev/null
    sudo ln -sf /etc/nginx/sites-available/callbot /etc/nginx/sites-enabled/ 2>/dev/null || true
    if sudo nginx -t 2>/dev/null; then
      sudo systemctl reload nginx
      FIXED=1
      echo "  OK: Synced and reloaded"
    else
      echo "  ERROR: nginx config invalid. Check SSL cert."
    fi
  fi
  if ! grep -q "stream.$DOMAIN\|$STREAM_HOST" "$NGINX_CONF" 2>/dev/null; then
    echo "  WARN: $STREAM_HOST not in server_name. Add it for stream subdomain."
    WARNINGS+=("Add $STREAM_HOST to nginx server_name")
  fi
else
  echo "  Syncing nginx (no existing callbot config)..."
  LANDING="$ROOT/landing/dist"
  [ ! -d "$LANDING" ] && LANDING="/var/www/html"
  sed "s|{{LANDING_ROOT}}|$LANDING|g" deploy/nginx/callbot.conf.template | sudo tee /etc/nginx/sites-available/callbot > /dev/null
  sudo ln -sf /etc/nginx/sites-available/callbot /etc/nginx/sites-enabled/ 2>/dev/null || true
  if sudo nginx -t 2>/dev/null; then
    sudo systemctl reload nginx
    FIXED=1
    echo "  OK: Created and reloaded"
  else
    echo "  ERROR: nginx config invalid"
  fi
fi
echo ""

# --- 5. SSL (443) ---
echo "--- 5. SSL (port 443) ---"
if sudo ss -tlnp 2>/dev/null | grep -q ":443 "; then
  echo "  OK: Port 443 listening"
else
  echo "  WARN: Port 443 not listening. Telnyx needs wss:// (HTTPS)."
  WARNINGS+=("Ensure nginx has ssl and cert. Run: sudo certbot certonly ... -d $STREAM_HOST")
fi
echo ""

# --- 6. Firewall ---
echo "--- 6. Firewall ---"
if command -v ufw &>/dev/null; then
  if sudo ufw status 2>/dev/null | grep -q "443.*ALLOW"; then
    echo "  OK: 443 allowed"
  else
    echo "  Adding 443 to ufw..."
    sudo ufw allow 443/tcp 2>/dev/null || true
    sudo ufw allow 80/tcp 2>/dev/null || true
    echo "y" | sudo ufw reload 2>/dev/null || true
    FIXED=1
    echo "  OK: Updated"
  fi
else
  echo "  (ufw not found, skipping)"
fi
echo ""

# --- 7. Code version ---
echo "--- 7. Code ---"
if grep -q "VOICE_STREAM_VERSION = \"v2026-03-stream-fix\"" backend/main.py 2>/dev/null; then
  echo "  OK: Has stream-fix version"
else
  echo "  WARN: Old code? Pull latest: git pull"
  WARNINGS+=("Run: git pull && pm2 delete callbot-voice && pm2 start ecosystem.config.cjs")
fi
if grep -q "\[asgi\] WebSocket scope received" backend/main.py 2>/dev/null; then
  echo "  OK: Has ASGI WebSocket debug"
else
  echo "  (No ASGI debug - optional)"
fi
echo ""

# --- 8. Voice API keys ---
echo "--- 8. Voice API keys ---"
MISSING=""
for k in DEEPGRAM_API_KEY GROK_API_KEY ELEVENLABS_API_KEY; do
  if ! grep -hE "^${k}=" .env .env.local 2>/dev/null | grep -q "=.\\+"; then
    MISSING="$MISSING $k"
  fi
done
if [ -n "$MISSING" ]; then
  echo "  WARN: Missing:$MISSING (pipeline will fail after WebSocket connect)"
  WARNINGS+=("Set DEEPGRAM_API_KEY, GROK_API_KEY, ELEVENLABS_API_KEY in .env")
else
  echo "  OK: Voice keys set"
fi
echo ""

# --- 9. Restart to pick up env ---
if [ $FIXED -gt 0 ]; then
  echo "--- Restarting callbot-voice (env reload) ---"
  pm2 delete callbot-voice 2>/dev/null || true
  pm2 start ecosystem.config.cjs
  pm2 save
  echo "  OK: Restarted"
  echo ""
fi

# --- Summary ---
echo "=============================================="
echo "  Summary"
echo "=============================================="
if [ ${#WARNINGS[@]} -gt 0 ]; then
  echo ""
  echo "Warnings:"
  for w in "${WARNINGS[@]}"; do
    echo "  - $w"
  done
  echo ""
fi
echo "Next steps:"
echo "  1. Place a test call to your Telnyx number"
echo "  2. pm2 logs callbot-voice --lines 100"
echo "  3. Look for: [asgi] WebSocket scope received"
echo "  4. Look for: [voice/stream] Accepting WebSocket"
echo "  5. Look for: Stream started for <id>"
echo ""
echo "Full reference: docs/90046-BULLETPROOF-FIX.md"
echo ""
