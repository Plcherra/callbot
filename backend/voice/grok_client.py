"""Grok (xAI) API client via httpx."""

import json
from typing import Any, Callable, Awaitable

import httpx

GROK_API = "https://api.x.ai/v1"

MAX_TOOL_ROUNDS = 5


async def chat(
    messages: list[dict[str, Any]],
    api_key: str,
    model: str = "grok-3-mini",
) -> str:
    """Chat completion with Grok (no tools)."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{GROK_API}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": m["role"], "content": m.get("content") or ""}
                    for m in messages
                ],
                "max_tokens": 256,
                "temperature": 0.7,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        content = (
            data.get("choices", [{}])[0].get("message", {}).get("content") or ""
        )
        return content.strip()


def _format_message(m: dict[str, Any]) -> dict[str, Any]:
    if m.get("tool_calls"):
        return {
            "role": "assistant",
            "content": m.get("content"),
            "tool_calls": [
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {
                        "name": tc["function"]["name"],
                        "arguments": tc["function"]["arguments"],
                    },
                }
                for tc in m["tool_calls"]
            ],
        }
    return {"role": m["role"], "content": m.get("content") or ""}


async def chat_with_tools(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    tool_executor: Callable[[str, dict[str, Any]], Awaitable[str]],
    api_key: str,
    model: str = "grok-3-mini",
) -> str:
    """Chat with function calling. Executes tools and loops until final text."""
    history = list(messages)
    async with httpx.AsyncClient(timeout=60.0) as client:
        for _ in range(MAX_TOOL_ROUNDS):
            resp = await client.post(
                f"{GROK_API}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [_format_message(m) for m in history],
                    "tools": tools,
                    "tool_choice": "auto",
                    "max_tokens": 512,
                    "temperature": 0.7,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            msg = data.get("choices", [{}])[0].get("message")
            if not msg:
                return ""

            tool_calls = msg.get("tool_calls") or []
            if not tool_calls:
                content = msg.get("content") or ""
                return content.strip()

            history.append({
                "role": "assistant",
                "content": msg.get("content"),
                "tool_calls": tool_calls,
            })

            for tc in tool_calls:
                name = tc["function"]["name"]
                try:
                    args = json.loads(tc["function"].get("arguments") or "{}")
                except json.JSONDecodeError:
                    args = {}
                try:
                    result = await tool_executor(name, args)
                    content = result if isinstance(result, str) else json.dumps(result)
                except Exception as e:
                    content = json.dumps({"success": False, "error": str(e)})
                history.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": content,
                })

    return "I'm sorry, I'm having trouble with that. Could you try again?"
