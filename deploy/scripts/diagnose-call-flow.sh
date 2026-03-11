#!/bin/bash
# Call flow diagnostics for echodesk.us.
# Run on VPS from project root: ./deploy/scripts/diagnose-call-flow.sh
#
# See docs/CALL_FLOW_AUDIT.md for full audit and fixes.

set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

DOMAIN="${1:-echodesk.us}"
BASE_URL="https://${DOMAIN}"

echo "=== Call Flow Diagnostics (domain: $DOMAIN) ==="
echo ""

# 1. PM2 status
echo "--- 1. PM2 status ---"
if command -v pm2 &>/dev/null; then
  pm2 list 2>/dev/null || echo "pm2 list failed"
else
  echo "pm2 not found"
fi
echo ""

# 2. Port 8000 listening
echo "--- 2. Port 8000 (voice backend) ---"
if command -v ss &>/dev/null; then
  ss -tlnp 2>/dev/null | grep 8000 || echo "Port 8000 not listening"
else
  netstat -tlnp 2>/dev/null | grep 8000 || echo "Port 8000 check skipped (ss/netstat)"
fi
echo ""

# 3. Backend health
echo "--- 3. Backend health (local) ---"
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/health 2>/dev/null | xargs -I{} echo "HTTP {} (200 = ok)" || echo "Backend not reachable on 8000"
echo ""

# 4. Nginx routing (voice webhook)
echo "--- 4. Nginx routing: POST $BASE_URL/api/telnyx/voice ---"
echo "Expect: JSON response. HTML/404 = nginx routes to Next.js (wrong)."
RESP=$(curl -s -X POST "$BASE_URL/api/telnyx/voice" -H "Content-Type: application/json" -d '{}' 2>/dev/null | head -c 200)
if echo "$RESP" | grep -q '<!DOCTYPE\|<html'; then
  echo "FAIL: Got HTML (routing to Next.js). Fix nginx: ./deploy/scripts/fix-nginx-voice.sh"
  echo "Sample: $(echo "$RESP" | head -c 80)..."
else
  echo "OK: Got non-HTML response (likely JSON)"
  echo "Sample: $(echo "$RESP" | head -c 100)"
fi
echo ""

# 5. Nginx config presence
echo "--- 5. Nginx config ---"
NGINX_CONF="/etc/nginx/sites-enabled/callbot"
if [ -f "$NGINX_CONF" ]; then
  echo "Callbot config: $NGINX_CONF exists"
  if grep -q "location /api/telnyx/voice" "$NGINX_CONF" 2>/dev/null; then
    echo "  Voice location blocks: present"
  else
    echo "  Voice location blocks: MISSING - run fix-nginx-voice.sh"
  fi
else
  echo "Callbot config not found at $NGINX_CONF"
fi
if command -v nginx &>/dev/null; then
  (sudo nginx -t 2>&1 | head -5) || echo "  (nginx -t skipped - run manually if needed)"
fi
echo ""

# 6. TELNYX_WEBHOOK_BASE_URL
echo "--- 6. TELNYX_WEBHOOK_BASE_URL ---"
for f in .env .env.local; do
  if [ -f "$f" ]; then
    val=$(grep -E "^TELNYX_WEBHOOK_BASE_URL=" "$f" 2>/dev/null | cut -d= -f2-)
    if [ -n "$val" ]; then
      echo "$f: $val"
      if echo "$val" | grep -q localhost; then
        echo "  WARNING: localhost - Telnyx cannot reach. Use https://$DOMAIN"
      fi
    fi
  fi
done
if ! grep -r "TELNYX_WEBHOOK_BASE_URL" .env .env.local 2>/dev/null | grep -v "^Binary" | grep -q .; then
  echo "Not set - defaults to localhost (broken). Add TELNYX_WEBHOOK_BASE_URL=https://$DOMAIN"
fi
echo ""

# 7. Voice logs hint
echo "--- 7. Next steps ---"
echo "Check voice logs: pm2 logs callbot-voice --lines 50"
echo "Full audit: docs/CALL_FLOW_AUDIT.md"
echo ""
echo "=== Done ==="
