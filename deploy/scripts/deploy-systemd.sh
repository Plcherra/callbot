#!/usr/bin/env bash
# Native systemd deploy for Echodesk on a VPS.
# Run from project root on the VPS: bash deploy/scripts/deploy-systemd.sh

set -euo pipefail

cd "$(dirname "$0")/../.."
ROOT="$(pwd)"

echo "=== Echodesk systemd deploy ==="
echo "Root: $ROOT"

bash scripts/check-docs.sh

[ -d venv ] || python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r backend/requirements.txt

# Node deps are minimal and only needed for helper scripts / legacy PM2 config.
npm install

echo "=== Validating environment ==="
./venv/bin/python scripts/validate-env.py

echo "=== Running migrations ==="
bash ./deploy/scripts/run-migrations.sh || {
  echo "WARNING: Migrations failed or skipped. Check DATABASE_URL."
}

if [ "${RUN_MIGRATION_CHECK:-0}" = "1" ]; then
  ./venv/bin/python scripts/check-migrations.py
fi

echo "=== Deploying landing ==="
bash ./deploy/scripts/deploy-landing.sh

echo "=== Installing/restarting systemd service ==="
sudo cp "$ROOT/deploy/systemd/echodesk-backend.service" /etc/systemd/system/echodesk-backend.service
sudo systemctl daemon-reload
sudo systemctl enable echodesk-backend
sudo systemctl restart echodesk-backend

sleep 3
curl -sS http://127.0.0.1:8000/api/health || true
echo

if [ -z "${SKIP_NGINX_SYNC:-}" ]; then
  echo "=== Syncing nginx config ==="
  bash ./deploy/scripts/sync-nginx-config.sh
else
  echo "=== Skipping nginx sync (SKIP_NGINX_SYNC=1) ==="
fi

if [ -z "${SKIP_VALIDATE_INFRA:-}" ]; then
  echo "=== Validating infrastructure ==="
  ./deploy/scripts/validate-infra-before-start.sh ${CI_MODE:+--ci}
else
  echo "=== Skipping infrastructure validation (SKIP_VALIDATE_INFRA=1) ==="
fi

echo "=== Deploy done ==="
sudo systemctl status echodesk-backend --no-pager
