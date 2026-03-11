#!/bin/bash
# Manual deploy script for callbot on Hetzner VPS
# Run from project root on VPS, or via SSH from deploy workflow
#
# Prerequisites: Node, pip3, PM2, nginx installed

set -e

cd "$(dirname "$0")/../.."
ROOT="$(pwd)"

echo "=== Callbot deploy ==="
echo "Root: $ROOT"

# Server Actions key required at build time (prevents "Failed to find Server Action" errors)
check_key() {
  for f in "$ROOT/.env" "$ROOT/.env.local"; do
    [ -f "$f" ] || continue
    val=$(grep "^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=" "$f" 2>/dev/null | cut -d= -f2- | tr -d '\r')
    [ -n "$val" ] && return 0
  done
  return 1
}
if ! check_key; then
  echo "ERROR: NEXT_SERVER_ACTIONS_ENCRYPTION_KEY is not set in .env or .env.local"
  echo "Run: ./deploy/scripts/setup-server-actions-key.sh"
  echo "Then redeploy."
  exit 1
fi

# Build Next.js (npm ci installs deps including tsx for validate:env)
npm ci

# Validate env vars before build (fail fast)
echo "=== Validating environment ==="
npm run validate:env || { echo "ERROR: Next.js env validation failed"; exit 1; }
python3 scripts/validate-env.py || { echo "ERROR: Backend env validation failed"; exit 1; }
npm run validate:env:crosscheck || true
npm run build

# Backend deps (use venv to avoid PEP 668 externally-managed-environment)
[ -d venv ] || python3 -m venv venv
./venv/bin/pip install -r backend/requirements.txt

# PM2
pm2 delete callbot 2>/dev/null || true
pm2 delete callbot-voice 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

# Pre-start infrastructure validation (fail deploy if critical checks fail)
EXTRA_FLAGS=""
[ -n "${GITHUB_ACTIONS:-}" ] && EXTRA_FLAGS="--ci"
echo "=== Validating infrastructure ==="
./deploy/scripts/validate-infra-before-start.sh $EXTRA_FLAGS || { echo "ERROR: Infrastructure validation failed"; exit 1; }

echo "=== Deploy done ==="
pm2 list
