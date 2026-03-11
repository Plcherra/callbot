#!/bin/bash
# Fix nginx so /api/telnyx/voice and /api/voice/ go to Python backend (port 8000).
# Run on VPS from project root: ./deploy/scripts/fix-nginx-voice.sh

set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "=== Fixing nginx for voice routing ==="

# Copy our config
sudo cp deploy/nginx/callbot.conf.template /etc/nginx/sites-available/callbot
sudo ln -sf /etc/nginx/sites-available/callbot /etc/nginx/sites-enabled/

# Test and reload
sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "=== Verify (localhost) ==="
LOCAL=$(curl -sk -X POST "https://127.0.0.1/api/telnyx/voice" -H "Host: echodesk.us" -H "Content-Type: application/json" -d '{}' 2>/dev/null | head -c 50)
if echo "$LOCAL" | grep -q 'success'; then
  echo "OK: Nginx routes to Python locally."
else
  echo "WARN: Local test got: $(echo "$LOCAL" | head -c 60)..."
  echo "Check: ls -la /etc/nginx/sites-enabled/ && sudo nginx -T | grep -A2 'location /api/telnyx'"
fi

echo ""
echo "=== Test via public URL ==="
echo "curl -s -X POST https://echodesk.us/api/telnyx/voice -H 'Content-Type: application/json' -d '{}'"
echo "(Expect JSON. If HTML: run ./deploy/scripts/diagnose-call-flow.sh - traffic may bypass nginx.)"
