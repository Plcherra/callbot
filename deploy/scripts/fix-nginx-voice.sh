#!/bin/bash
# Fix nginx so /api/telnyx/voice and /api/voice/ go to Python backend (port 8000).
# Run on VPS from project root: ./deploy/scripts/fix-nginx-voice.sh
#
# Uses sync-nginx-config.sh (full or http-only based on SSL cert).

set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "=== Fixing nginx for voice routing ==="
"$ROOT/deploy/scripts/sync-nginx-config.sh"

echo ""
echo "=== Verify (localhost) ==="
# Use http (works with both full SSL and http-only configs)
LOCAL=$(curl -s -X POST "http://127.0.0.1/api/telnyx/voice" -H "Host: echodesk.us" -H "Content-Type: application/json" -d '{}' 2>/dev/null | head -c 50)
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
