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

echo "=== Done. Test with: ==="
echo "curl -s -X POST https://echodesk.us/api/telnyx/voice -H 'Content-Type: application/json' -d '{}'"
echo "(Should return JSON, not HTML)"
