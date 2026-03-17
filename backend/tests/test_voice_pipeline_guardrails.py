from __future__ import annotations

import asyncio
import json

import pytest

from voice import pipeline


@pytest.mark.asyncio
async def test_pre_tool_filler_and_dedupe_once_per_turn(monkeypatch):
    """
    Guardrail: before first calendar tool call in a user turn, say 'One moment…' once,
    and dedupe identical tool calls (normalized args) within the turn.
    """
    calls: dict[str, int] = {"tts": 0, "calendar": 0}
    spoken: list[str] = []
    calendar_args: list[dict] = []

    async def fake_tts(text: str, config: dict, on_audio, on_error=None, **_kwargs):
        calls["tts"] += 1
        spoken.append(text)

    async def fake_call_calendar_tool(base_url: str, api_key: str, rec_id: str, name: str, args: dict) -> str:
        calls["calendar"] += 1
        calendar_args.append({"name": name, "args": args})
        return json.dumps({"success": True})

    monkeypatch.setattr(pipeline, "generate_and_send_tts", fake_tts)
    monkeypatch.setattr(pipeline, "call_calendar_tool", fake_call_calendar_tool)

    config = {
        "system_prompt": "sys",
        "grok_api_key": "grok",
        "deepgram_api_key": "dg",
        "elevenlabs_api_key": "el",
        "elevenlabs_voice_id": "voice",
        "voice_server_base_url": "https://example.com",
        "voice_server_api_key": "k",
        "receptionist_id": "rec-1",
    }

    async def on_audio(_chunk: bytes):
        return None

    tool_exec = pipeline.make_calendar_tool_exec(
        config=config,
        on_audio=on_audio,
        on_error=None,
        tts_failure_logged=[False],
    )

    # Simulate the model calling the same tool twice with slightly different arg types.
    await tool_exec("check_availability", {"date_text": "tomorrow morning", "duration_minutes": "60"})
    await tool_exec("check_availability", {"date_text": "tomorrow morning", "duration_minutes": 60})

    # Our fake_chat_with_tools ran tool_exec twice; dedupe should mean only 1 calendar call.
    assert calls["calendar"] == 1
    # Filler phrase should have been spoken once (before tool call).
    assert spoken.count(pipeline.PRE_TOOL_FILLER_PHRASE) == 1

