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

# Build Next.js
npm ci
npm run build

# Backend deps (use venv to avoid PEP 668 externally-managed-environment)
[ -d venv ] || python3 -m venv venv
./venv/bin/pip install -r backend/requirements.txt

# PM2
pm2 delete callbot 2>/dev/null || true
pm2 delete callbot-voice 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo "=== Deploy done ==="
pm2 list
