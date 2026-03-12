#!/bin/bash
# Sync nginx config from repo templates. Picks full (SSL) or http-only based on cert.
# Run from project root: ./deploy/scripts/sync-nginx-config.sh
#
# Use when: deploy fails on "nginx config invalid" or after pulling nginx template changes.

set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

SSL_CERT="/etc/letsencrypt/live/echodesk.us/fullchain.pem"
FULL_TEMPLATE="$ROOT/deploy/nginx/callbot.conf.template"
HTTP_TEMPLATE="$ROOT/deploy/nginx/callbot-http-only.conf.template"
NGINX_SITE="/etc/nginx/sites-available/callbot"

echo "=== Syncing nginx config ==="

if [ -f "$SSL_CERT" ]; then
  echo "SSL cert found: using full config (port 80 redirect + 443)"
  sudo cp "$FULL_TEMPLATE" "$NGINX_SITE"
else
  echo "SSL cert not found at $SSL_CERT – using http-only config"
  sudo cp "$HTTP_TEMPLATE" "$NGINX_SITE"
fi

sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/

echo "Testing nginx config..."
if ! sudo nginx -t; then
  echo "ERROR: nginx config invalid. Check: sudo nginx -t"
  exit 1
fi

sudo systemctl reload nginx
echo "nginx config synced and reloaded."
