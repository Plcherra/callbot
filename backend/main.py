"""FastAPI voice backend - WebSocket + HTTP routes."""

import os
from pathlib import Path

# Load .env from project root (parent of backend/)
_root = Path(__file__).resolve().parent.parent
_env = _root / ".env"
_env_local = _root / ".env.local"
if _env.exists():
    from dotenv import load_dotenv
    load_dotenv(_env)
if _env_local.exists():
    from dotenv import load_dotenv
    load_dotenv(_env_local)

import logging
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Header, HTTPException
from fastapi.responses import JSONResponse

from config import settings
from voice.handler import handle_voice_stream_connection
from telnyx.voice_webhook import handle_voice_webhook
from telnyx.webhook import validate_telnyx_webhook
from calendar_api.calendar_handler import handle_calendar_request
from prompts.fetch import _build_from_supabase_sync
from supabase_client import create_service_role_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        settings.validate_voice_keys()
    except ValueError as e:
        logger.error("Startup validation failed: %s", e)
        raise
    yield
    logger.info("Shutting down")


app = FastAPI(title="Echodesk Voice Backend", lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.websocket("/api/voice/stream")
async def voice_stream(ws):
    await ws.accept()
    await handle_voice_stream_connection(ws)


@app.post("/api/telnyx/voice")
async def telnyx_voice(request: Request):
    raw = await request.body()
    sig = request.headers.get("t-signature") or request.headers.get("telnyx-signature") or request.headers.get("x-telnyx-signature")
    if settings.telnyx_webhook_secret and sig:
        if not validate_telnyx_webhook(raw, sig, webhook_secret=settings.telnyx_webhook_secret):
            raise HTTPException(status_code=403, detail="Invalid signature")
    elif settings.telnyx_webhook_secret:
        logger.warning("TELNYX_WEBHOOK_SECRET set but no signature header")
    else:
        logger.warning("Telnyx webhook not verified - TELNYX_WEBHOOK_SECRET not set")

    try:
        body = __import__("json").loads(raw.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    result = await handle_voice_webhook(body, raw)
    return JSONResponse(result)


@app.get("/api/receptionist-prompt")
async def receptionist_prompt(
    request: Request,
    x_voice_server_key: str = Header(None, alias="x-voice-server-key"),
    x_voice_api_key: str = Header(None, alias="x-voice-api-key"),
):
    receptionist_id = request.query_params.get("receptionist_id", "")
    api_key = settings.voice_server_api_key
    if not api_key or not api_key.strip():
        raise HTTPException(status_code=503, detail="Prompt API not configured")
    provided = x_voice_server_key or x_voice_api_key
    if provided != api_key:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not receptionist_id or not receptionist_id.strip():
        return {
            "prompt": "You are an AI receptionist. Be helpful and concise.",
            "greeting": "Hello! Thanks for calling. How can I help you today?",
        }

    supabase = create_service_role_client()
    prompt, greeting = _build_from_supabase_sync(receptionist_id, supabase)
    return {"prompt": prompt, "greeting": greeting}


@app.post("/api/voice/calendar")
async def voice_calendar(
    request: Request,
    x_voice_server_key: str = Header(None, alias="x-voice-server-key"),
    x_voice_api_key: str = Header(None, alias="x-voice-api-key"),
):
    api_key = settings.voice_server_api_key
    if not api_key or not api_key.strip():
        raise HTTPException(status_code=503, detail="Calendar API not configured")
    provided = x_voice_server_key or x_voice_api_key
    if provided != api_key:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    return await handle_calendar_request(body)


if __name__ == "__main__":
    import uvicorn
    port = getattr(settings, "port", 8000)
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
