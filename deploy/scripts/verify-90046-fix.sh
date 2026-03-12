#!/bin/bash
# Verify 90046/403 fix: confirm deployed code + env, then test.
# Run on VPS from project root: ./deploy/scripts/verify-90046-fix.sh
#
# If WebSocket still 403: ensure you've pulled latest, then:
#   pm2 delete callbot-voice && pm2 start ecosystem.config.cjs
# (Use delete+start, NOT restart, so .env is reloaded.)

set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "=== 90046/403 Fix Verification ==="
echo ""

# 1. Code version
echo "--- 1. Deployed code ---"
if grep -q "VOICE_STREAM_VERSION = \"v2026-03-stream-fix\"" backend/main.py 2>/dev/null; then
  echo "OK: Has stream-fix version (voice_stream accepts first, no reject-before-accept)"
else
  echo "WARN: Code may be old. Pull latest and redeploy."
  echo "  Expected: VOICE_STREAM_VERSION in backend/main.py"
fi
if grep -q "\[voice/stream\] Accepting WebSocket" backend/main.py 2>/dev/null; then
  echo "OK: Has Accepting WebSocket log (will appear when Telnyx connects)"
else
  echo "WARN: Missing Accepting WebSocket log - old code?"
fi
echo ""

# 2. PM2 logs - startup version
echo "--- 2. Running version (from PM2 logs) ---"
if pm2 logs callbot-voice --lines 100 --nostream 2>/dev/null | grep -q "\[startup\] Voice backend v2026-03-stream-fix"; then
  echo "OK: Startup shows v2026-03-stream-fix"
else
  echo "WARN: Startup version not found. Restart with: pm2 delete callbot-voice && pm2 start ecosystem.config.cjs"
fi
echo ""

# 3. Env
echo "--- 3. Stream URL env ---"
if [ -f .env ]; then
  STREAM=$(grep -E "^TELNYX_STREAM_BASE_URL=" .env 2>/dev/null | cut -d= -f2-)
  WEBHOOK=$(grep -E "^TELNYX_WEBHOOK_BASE_URL=" .env 2>/dev/null | cut -d= -f2-)
  echo "TELNYX_STREAM_BASE_URL=${STREAM:-<not set>}"
  echo "TELNYX_WEBHOOK_BASE_URL=${WEBHOOK:-<not set>}"
  if [ -n "$STREAM" ]; then
    echo "OK: Stream URL will be wss://$(echo "$STREAM" | sed 's|https\?://||' | cut -d/ -f1)/api/voice/stream?..."
  else
    echo "WARN: TELNYX_STREAM_BASE_URL not set. Will use webhook base; if that goes through Cloudflare, WebSocket may 403."
  fi
else
  echo "WARN: .env not found"
fi
echo ""

# 4. Nginx stream routing
echo "--- 4. Nginx /api/voice/ ---"
if grep -r "api/voice" /etc/nginx/sites-enabled/ 2>/dev/null | grep -q "proxy_pass"; then
  echo "OK: Nginx proxies /api/voice/ to backend"
else
  echo "WARN: Check nginx config for location ^~ /api/voice/"
fi
echo ""

# 5. What to do next
echo "--- Next steps ---"
echo "1. If any WARN above: pull latest, then: pm2 delete callbot-voice && pm2 start ecosystem.config.cjs"
echo "2. Place a test call"
echo "3. Run: pm2 logs callbot-voice --lines 50"
echo "4. Look for: [startup] Voice backend v2026-03-stream-fix"
echo "5. Look for: [voice/stream] Accepting WebSocket (means handler reached)"
echo "6. If still 403 with no Accepting WebSocket: request never reaches handler - check nginx, firewall, stream host"
echo ""
