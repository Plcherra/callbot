#!/bin/bash
# Renew Let's Encrypt SSL cert for echodesk.us
# Run on VPS (requires certbot, nginx)
#
# Optional: add to crontab for auto-renewal:
#   0 3 * * * /path/to/callbot/deploy/scripts/renew-cert.sh

set -e

DOMAIN="echodesk.us"

# Certbot renew (uses existing config)
certbot renew --quiet --nginx -d "$DOMAIN" -d "www.$DOMAIN"

# Reload nginx to pick up new certs
systemctl reload nginx

echo "Cert renewed for $DOMAIN"
