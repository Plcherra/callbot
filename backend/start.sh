#!/bin/bash
# Start the voice backend. Run from project root or backend/.
cd "$(dirname "$0")"
exec python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
