#!/bin/bash
# Obtain Let's Encrypt SSL cert for echodesk.us (first-time setup).
# Requires: domain must point to this server's IP.
#
# Run on VPS: ./deploy/scripts/get-ssl-cert.sh

set -e
DOMAIN="echodesk.us"

echo "=== Obtaining SSL cert for $DOMAIN ==="
echo "Ensure $DOMAIN and www.$DOMAIN point to this server's IP."
echo ""

# Stop nginx so certbot can bind to port 80
sudo systemctl stop nginx

# Get cert (standalone mode - certbot binds to 80)
sudo certbot certonly --standalone -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email

# If you want to use email: remove --register-unsafely-without-email and add -m your@email.com

sudo systemctl start nginx

echo ""
echo "Done. If cert was obtained, switch to HTTPS config:"
echo "  sudo cp deploy/nginx/callbot.conf.template /etc/nginx/sites-available/callbot"
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "If cert failed, use HTTP-only config for now:"
echo "  sudo cp deploy/nginx/callbot-http-only.conf.template /etc/nginx/sites-available/callbot"
echo "  sudo nginx -t && sudo systemctl start nginx"
