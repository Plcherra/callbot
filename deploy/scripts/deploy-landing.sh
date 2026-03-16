#!/usr/bin/env bash
# Deploy static landing page for echodesk.us
# Usage (on VPS, from repo root): ./deploy/scripts/deploy-landing.sh
#
# - Assumes landing/dist contains the built/static landing site
# - Syncs landing/dist -> /var/www/echodesk-landing
# - Sets safe ownership/permissions for nginx (www-data)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC_DIR="$ROOT/landing/dist"
TARGET_DIR="/var/www/echodesk-landing"
NGINX_USER="www-data"

echo "=== Deploy landing page ==="
echo "Source:  $SRC_DIR"
echo "Target:  $TARGET_DIR"

if [ ! -d "$SRC_DIR" ]; then
  echo "ERROR: landing build output not found at: $SRC_DIR"
  echo "Expected static files (at least index.html) in landing/dist."
  exit 1
fi

if [ ! -f "$SRC_DIR/index.html" ]; then
  echo "ERROR: $SRC_DIR/index.html not found."
  echo "Ensure the landing page build output exists before deploying."
  exit 1
fi

echo "Creating target directory (if needed)..."
sudo mkdir -p "$TARGET_DIR"

echo "Syncing landing files to $TARGET_DIR ..."
sudo rsync -a --delete "$SRC_DIR"/ "$TARGET_DIR"/

echo "Setting ownership and permissions for nginx user ($NGINX_USER)..."
if id "$NGINX_USER" >/dev/null 2>&1; then
  sudo chown -R "$NGINX_USER:$NGINX_USER" "$TARGET_DIR"
else
  echo "WARNING: user '$NGINX_USER' not found; skipping chown."
fi

# Safe, read-only-ish permissions for static content
sudo find "$TARGET_DIR" -type d -exec chmod 755 {} \;
sudo find "$TARGET_DIR" -type f -exec chmod 644 {} \;

echo "=== Landing deploy complete ==="
echo "Deployed files:"
sudo find "$TARGET_DIR" -maxdepth 2 -type f -print | sed 's/^/  /'
echo
echo "You should now see the updated landing at: https://echodesk.us"

