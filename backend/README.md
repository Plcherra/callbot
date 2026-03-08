# Echodesk Voice Backend (Python/FastAPI)

Run from project root:

```bash
cd /path/to/project
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Or from backend directory:

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

Set `TELNYX_WEBHOOK_BASE_URL` to your public URL (e.g. `https://voice.yourdomain.com`) so Telnyx can reach the webhook and WebSocket.
