#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."  # To root
source venv/bin/activate
exec python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --workers 1 --log-level info