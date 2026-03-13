"""Deepgram real-time STT via WebSocket."""

import json
import asyncio
from typing import Any, Callable, Awaitable, Optional

import websockets
from websockets.asyncio.client import ClientConnection

DEEPGRAM_WS = "wss://api.deepgram.com/v1/listen"


def parse_deepgram_message(data: str) -> Optional[dict[str, Any]]:
    """Parse Deepgram WebSocket message for transcript."""
    try:
        return json.loads(data)
    except json.JSONDecodeError:
        return None


async def create_deepgram_live(
    api_key: str,
    encoding: str = "mulaw",
    sample_rate: int = 8000,
    on_message: Optional[Callable[[dict], Awaitable[None]]] = None,
    on_error: Optional[Callable[[Exception], None]] = None,
) -> tuple[ClientConnection, asyncio.Task]:
    """Create Deepgram WebSocket and spawn receive loop. Returns (ws, receive_task)."""
    params = {
        "encoding": encoding,
        "sample_rate": str(sample_rate),
        "channels": "1",
        "punctuate": "true",
        "interim_results": "true",
    }
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"{DEEPGRAM_WS}?{qs}"
    headers = {"Authorization": f"Token {api_key}"}

    ws = await websockets.connect(
        url,
        additional_headers=headers,
        ping_interval=None,
        ping_timeout=None,
        close_timeout=5,
    )

    async def receive_loop() -> None:
        try:
            async for msg in ws:
                if isinstance(msg, str) and on_message:
                    parsed = parse_deepgram_message(msg)
                    if parsed:
                        await on_message(parsed)
        except Exception as e:
            if on_error:
                on_error(e)

    task = asyncio.create_task(receive_loop())
    return ws, task
