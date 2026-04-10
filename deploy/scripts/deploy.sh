#!/bin/bash
# Manual deploy script for callbot on Hetzner VPS
# Run from project root on VPS: ./deploy/scripts/deploy.sh
#
# Architecture: Python FastAPI (voice + mobile API) + static landing. No Next.js.
# Prerequisites: pip3, PM2, nginx installed

set -e

cd "$(dirname "$0")/../.."
ROOT="$(pwd)"

echo "=== Callbot deploy ==="
echo "Root: $ROOT"

bash scripts/check-docs.sh || { echo "ERROR: Docs allowlist check failed"; exit 1; }

# Backend deps
[ -d venv ] || python3 -m venv venv
./venv/bin/pip install -r backend/requirements.txt

# Node deps for PM2 ecosystem config (dotenv for env loading). Minimal - no Next.js.
npm install 2>/dev/null || true

# Validate env vars before start
echo "=== Validating environment ==="
./venv/bin/python scripts/validate-env.py || { echo "ERROR: Backend env validation failed"; exit 1; }

# Run DB migrations (skip with SKIP_MIGRATIONS=1)
echo "=== Running migrations ==="
bash ./deploy/scripts/run-migrations.sh || { echo "WARNING: Migrations failed or skipped. Check DATABASE_URL."; }

# Verify migrations (fail deploy if RUN_MIGRATION_CHECK=1 and check fails)
if [ "${RUN_MIGRATION_CHECK:-0}" = "1" ]; then
  ./venv/bin/python scripts/check-migrations.py || { echo "ERROR: Migration check failed. Apply 030, 031, 032."; exit 1; }
fi

# Ensure landing/dist exists (static site - no build)
if [ ! -d "$ROOT/landing/dist" ]; then
  echo "WARNING: landing/dist not found. Create it or pull from repo."
fi

# PM2: Python backend only
pm2 delete callbot-voice 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

# Give uvicorn a moment to bind to port 8000
sleep 3

# Sync nginx config from repo (skip with SKIP_NGINX_SYNC=1 if sudo not configured)
if [ -z "${SKIP_NGINX_SYNC:-}" ]; then
  echo "=== Syncing nginx config ==="
  bash ./deploy/scripts/sync-nginx-config.sh || {
    echo "WARNING: nginx sync failed (sudo password?). Run: sudo bash deploy/scripts/setup-passwordless-sudo.sh"
    echo "Or set SKIP_NGINX_SYNC=1 to skip. Deploy continues..."
  }
else
  echo "=== Skipping nginx sync (SKIP_NGINX_SYNC=1) ==="
fi

# Pre-start infrastructure validation (skip with SKIP_VALIDATE_INFRA=1)
if [ -z "${SKIP_VALIDATE_INFRA:-}" ]; then
  EXTRA_FLAGS=""
  [ -n "${GITHUB_ACTIONS:-}" ] && EXTRA_FLAGS="--ci"
  echo "=== Validating infrastructure ==="
  ./deploy/scripts/validate-infra-before-start.sh $EXTRA_FLAGS || { echo "ERROR: Infrastructure validation failed"; exit 1; }
else
  echo "=== Skipping infrastructure validation (SKIP_VALIDATE_INFRA=1) ==="
fi

echo "=== Deploy done ==="
pm2 list
