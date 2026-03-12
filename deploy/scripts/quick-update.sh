#!/bin/bash
# Quick update: git pull + restart. Use when full deploy fails but you need the latest code.
# Run from project root on VPS: ./deploy/scripts/quick-update.sh

set -e
cd "$(dirname "$0")/../.."

echo "=== Quick update ==="
git fetch --all
git reset --hard origin/main
git pull origin main || true
echo "Latest commit: $(git rev-parse HEAD 2>/dev/null || echo 'unknown')"

# Reinstall Python deps (in case requirements changed)
[ -d venv ] && ./venv/bin/pip install -q -r backend/requirements.txt || true

pm2 restart callbot-voice
pm2 save
echo "=== Done. Check: pm2 logs callbot-voice ==="
