#!/bin/bash
# Start the voice backend. Run from project root.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
# Use venv if it exists
if [ -f "$ROOT/venv/bin/activate" ]; then
  . "$ROOT/venv/bin/activate"
fi
exec python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
