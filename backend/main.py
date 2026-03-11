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

import httpx
from fastapi import FastAPI, Request, Header, HTTPException
from fastapi.responses import JSONResponse

from config import settings
from voice.handler import handle_voice_stream_connection
from telnyx.voice_webhook import handle_voice_webhook
from telnyx.voice_webhook_verify import (
    check_rate_limit,
    get_client_ip,
    record_verification_failure,
    verify_webhook_request,
)
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
        settings.validate_supabase()
        settings.validate_telnyx()
        if settings.telnyx_skip_verify:
            logger.warning(
                "SECURITY: TELNYX_SKIP_VERIFY is enabled. Webhook signature verification is DISABLED. "
                "Use only when headers are stripped by proxy (e.g. Cloudflare Tunnel). "
                "Ensure TELNYX_ALLOWED_IPS is set for defense-in-depth."
            )
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


@app.post(
    "/api/telnyx/voice",
    responses={
        200: {"description": "Webhook processed successfully"},
        400: {"description": "Invalid JSON body"},
        403: {
            "description": "Webhook signature verification failed",
            "content": {
                "application/json": {
                    "example": {
                        "detail": "Webhook signature verification failed",
                        "code": "webhook_verification_failed",
                    }
                }
            },
        },
        429: {"description": "Too many invalid signature attempts; try again later"},
    },
)
async def telnyx_voice(request: Request):
    raw = await request.body()
    headers = {k: v for k, v in request.headers.items()}
    client_ip = get_client_ip(headers, request.client.host if request.client else None)
    user_agent = headers.get("user-agent") or headers.get("User-Agent")

    ed25519_sig = headers.get("telnyx-signature-ed25519")
    timestamp = headers.get("telnyx-timestamp")
    hmac_sig = (
        headers.get("t-signature")
        or headers.get("telnyx-signature")
        or headers.get("x-telnyx-signature")
    )

    # Rate limit check before verification
    if await check_rate_limit(client_ip):
        logger.warning(
            "Telnyx webhook rate limited: too many failed attempts",
            extra={"client_ip": client_ip},
        )
        raise HTTPException(
            status_code=429,
            detail="Too many invalid signature attempts; try again later",
        )

    result = verify_webhook_request(
        raw,
        ed25519_sig=ed25519_sig,
        timestamp=timestamp,
        hmac_sig=hmac_sig,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    if not result.verified:
        record_verification_failure(client_ip)
        raise HTTPException(
            status_code=403,
            detail=result.detail,
        )

    try:
        body = __import__("json").loads(raw.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    result_response = await handle_voice_webhook(body, raw)
    return JSONResponse(result_response)


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


@app.get("/api/cron/payg-billing")
async def cron_payg_billing(
    authorization: str = Header(None, alias="Authorization"),
):
    """
    Proxy to Next.js payg-billing cron. Run on 1st of month.
    Requires APP_API_BASE_URL and CRON_SECRET in backend .env.
    """
    base = (settings.app_api_base_url or "").rstrip("/")
    secret = settings.cron_secret
    if not base or not secret:
        raise HTTPException(
            status_code=503,
            detail="Cron not configured: set APP_API_BASE_URL and CRON_SECRET",
        )
    auth_val = authorization or ""
    if not auth_val.startswith("Bearer ") or auth_val[7:] != secret:
        raise HTTPException(status_code=401, detail="Unauthorized")

    url = f"{base}/api/cron/payg-billing"
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.get(url, headers={"Authorization": f"Bearer {secret}"})
        try:
            body = r.json()
        except Exception:
            body = {"raw": r.text[:500]}
        return {"ok": r.status_code == 200, "status": r.status_code, "body": body}
    except Exception as e:
        logger.exception("Cron payg-billing proxy failed")
        raise HTTPException(status_code=502, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = getattr(settings, "port", 8000)
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
