#!/bin/bash
# One-time setup: Grant passwordless sudo for nginx deploy commands.
# Run as root on VPS: sudo bash deploy/scripts/setup-passwordless-sudo.sh
#
# Required for GitHub Actions deploy (SSH runs deploy.sh which runs sync-nginx-config.sh).

set -e
DEPLOY_USER="${1:-adam}"  # User that runs deploy (SSH user)

echo "Setting up passwordless sudo for $DEPLOY_USER (nginx deploy commands)..."

SUDOERS_FILE="/etc/sudoers.d/callbot-deploy"
cat > "$SUDOERS_FILE" << EOF
# Callbot deploy: allow $DEPLOY_USER to sync nginx config without password
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/nginx/sites-available/callbot
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/ln -sf /etc/nginx/sites-available/callbot /etc/nginx/sites-enabled/callbot
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/sbin/nginx -t
$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload nginx
EOF

chmod 440 "$SUDOERS_FILE"
visudo -c -f "$SUDOERS_FILE"  # Validate syntax

echo "Done. $DEPLOY_USER can now run deploy without sudo password."
