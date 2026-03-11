#!/bin/bash
# Setup NEXT_SERVER_ACTIONS_ENCRYPTION_KEY for Next.js Server Actions on VPS.
# Run once on the server to fix "Failed to find Server Action" errors.
# Must be run BEFORE npm run build.
#
# Usage: ./deploy/scripts/setup-server-actions-key.sh
# Or from project root: bash deploy/scripts/setup-server-actions-key.sh

set -e

cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
ENV_FILE="${ROOT}/.env"

echo "=== Setup Server Actions encryption key ==="
echo "Project root: $ROOT"

# Check if key already exists
if [ -f "$ENV_FILE" ] && grep -q "^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=" "$ENV_FILE" 2>/dev/null; then
  existing=$(grep "^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=" "$ENV_FILE" | cut -d= -f2)
  if [ -n "$existing" ]; then
    echo "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY already set in .env"
    echo "To regenerate: remove the line from .env and run this script again."
    exit 0
  fi
fi

# Generate key (32 bytes, base64)
KEY=$(openssl rand -base64 32)
echo "Generated new encryption key"

# Ensure .env exists
if [ ! -f "$ENV_FILE" ]; then
  touch "$ENV_FILE"
  echo "Created .env"
fi

# Add or update the key (portable: works on macOS and Linux)
if grep -q "^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=" "$ENV_FILE" 2>/dev/null; then
  grep -v "^NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=" "$ENV_FILE" > "${ENV_FILE}.tmp"
  echo "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$KEY" >> "${ENV_FILE}.tmp"
  mv "${ENV_FILE}.tmp" "$ENV_FILE"
  echo "Updated NEXT_SERVER_ACTIONS_ENCRYPTION_KEY in .env"
else
  echo "" >> "$ENV_FILE"
  echo "# Server Actions - required for PM2/VPS (prevents 'Failed to find Server Action' errors)" >> "$ENV_FILE"
  echo "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$KEY" >> "$ENV_FILE"
  echo "Added NEXT_SERVER_ACTIONS_ENCRYPTION_KEY to .env"
fi

echo ""
echo "Done. Next steps:"
echo "  1. npm run build"
echo "  2. pm2 restart callbot"
echo ""
echo "Or run full deploy: ./deploy/scripts/deploy.sh"
