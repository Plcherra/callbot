#!/bin/bash
# Restore call flow: restart voice backend, fix nginx, verify tunnel config.
# Run on VPS from project root: ./deploy/scripts/restore-call-flow.sh
#
# See docs/CALL_FLOW_DIAGNOSTIC.md for full troubleshooting.

set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

DOMAIN="${1:-echodesk.us}"
echo "=== Call Flow Recovery (domain: $DOMAIN) ==="
echo ""

# Step 1: Restart callbot-voice
echo "--- 1. Restarting callbot-voice ---"
pm2 restart callbot-voice 2>/dev/null || pm2 start ecosystem.config.cjs
sleep 2
pm2 list
echo ""
echo "Recent voice logs:"
pm2 logs callbot-voice --lines 10 --nostream 2>/dev/null || echo "(no logs yet)"
echo ""

# Step 2: Fix nginx voice routing
echo "--- 2. Fixing nginx voice routing ---"
./deploy/scripts/fix-nginx-voice.sh
echo ""

# Step 3: Cloudflare Tunnel check
echo "--- 3. Cloudflare Tunnel ingress ---"
TUNNEL_CONFIG=""
for path in /etc/cloudflared/config.yml ~/.cloudflared/config.yml /etc/cloudflared/config.yaml; do
  if [ -f "$path" ]; then
    TUNNEL_CONFIG="$path"
    break
  fi
done
if [ -n "$TUNNEL_CONFIG" ]; then
  echo "Found tunnel config: $TUNNEL_CONFIG"
  if grep -q "service:.*:3000" "$TUNNEL_CONFIG" 2>/dev/null; then
    echo ""
    echo "WARNING: Tunnel may point at Next.js (:3000) instead of nginx (:80)."
    echo "Voice routes require nginx. Update ingress to:"
    echo ""
    echo "  ingress:"
    echo "    - hostname: $DOMAIN"
    echo "      service: http://127.0.0.1:80    # nginx, NOT :3000"
    echo "    - service: http_status:404"
    echo ""
    echo "Then: sudo systemctl restart cloudflared"
  else
    echo "Config looks OK (not pointing at :3000 for main host)."
  fi
else
  echo "No cloudflared config found in common paths."
  echo "If using Cloudflare Tunnel, ensure it points at nginx (:80), not Next.js (:3000)."
fi
echo ""

# Step 4: TELNYX env vars
echo "--- 4. Voice env vars ---"
for f in .env .env.local; do
  if [ -f "$f" ]; then
    webhook=$(grep -E "^TELNYX_WEBHOOK_BASE_URL=" "$f" 2>/dev/null | cut -d= -f2-)
    if [ -n "$webhook" ]; then
      echo "TELNYX_WEBHOOK_BASE_URL=$webhook"
      if echo "$webhook" | grep -q localhost; then
        echo "  WARNING: Use https://$DOMAIN (Telnyx cannot reach localhost)"
      fi
    fi
  fi
done
echo ""

# Step 5: Full diagnostics
echo "--- 5. Running full diagnostics ---"
./deploy/scripts/diagnose-call-flow.sh "$DOMAIN"

echo ""
echo "=== Recovery steps complete ==="
echo "Place a test call and watch: pm2 logs callbot-voice"
echo "Look for: 'Answered call', 'Stream started', and no 403/90046 errors."
