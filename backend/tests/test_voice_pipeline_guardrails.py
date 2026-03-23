from __future__ import annotations

import asyncio
import json

import pytest

from voice import pipeline
from voice.calendar_tools import CALENDAR_TOOLS


@pytest.mark.asyncio
async def test_pre_tool_filler_and_dedupe_once_per_turn(monkeypatch):
    """
    Guardrail: before first calendar tool call in a user turn, say 'One sec.' once,
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
        "tts_provider": "google",
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
        last_availability_slots={},
    )

    # Simulate the model calling the same tool twice with slightly different arg types.
    await tool_exec("check_availability", {"date_text": "tomorrow morning", "duration_minutes": "60"})
    await tool_exec("check_availability", {"date_text": "tomorrow morning", "duration_minutes": 60})

    # Our fake_chat_with_tools ran tool_exec twice; dedupe should mean only 1 calendar call.
    assert calls["calendar"] == 1
    # Filler phrase should have been spoken once (before tool call).
    assert spoken.count(pipeline.PRE_TOOL_FILLER_PHRASE) == 1


@pytest.mark.asyncio
async def test_create_appointment_sanitizes_followup_fields(monkeypatch):
    """When create_appointment returns success with followup fields, they are stripped before LLM sees result."""
    result_holder: list[str] = []

    async def fake_call_calendar_tool(base_url: str, api_key: str, rec_id: str, name: str, args: dict) -> str:
        if name == "create_appointment":
            return json.dumps({
                "success": True,
                "event_id": "evt-1",
                "start": "2026-03-17T15:00:00",
                "followup_message_resolved": "We'll text you a payment link.",
                "payment_link": "https://pay.example/link",
                "meeting_instructions": "Use the link in your confirmation.",
                "owner_selected_platform": "Zoom",
            })
        return json.dumps({"success": True})

    monkeypatch.setattr(pipeline, "call_calendar_tool", fake_call_calendar_tool)

    config = {
        "voice_server_base_url": "https://example.com",
        "voice_server_api_key": "k",
        "receptionist_id": "rec-1",
    }
    tool_exec = pipeline.make_calendar_tool_exec(
        config=config,
        on_audio=lambda _: None,
        on_error=None,
        tts_failure_logged=[False],
        last_availability_slots={},
    )

    result = await tool_exec("create_appointment", {
        "summary": "Test",
        "start_time": "2026-03-17T15:00:00",
        "duration_minutes": 30,
    })
    parsed = json.loads(result)
    assert parsed.get("success") is True
    assert "followup_message_resolved" not in parsed
    assert "payment_link" not in parsed
    assert "meeting_instructions" not in parsed
    assert "owner_selected_platform" not in parsed


@pytest.mark.asyncio
async def test_check_availability_blocked_when_services_exist_and_no_service_selected(monkeypatch):
    """When backend returns service_selection_required, tool_exec passes it through to LLM."""
    async def fake_call_calendar_tool(base_url: str, api_key: str, rec_id: str, name: str, args: dict) -> str:
        if name == "check_availability" and not args.get("service_id") and not args.get("service_name") and not args.get("generic_appointment_requested"):
            return json.dumps({
                "success": False,
                "error": "service_selection_required",
                "message": "Sure — what would you like to book? Are you looking for one of our services, or a general appointment?",
            })
        return json.dumps({"success": True, "suggested_slots": []})

    monkeypatch.setattr(pipeline, "call_calendar_tool", fake_call_calendar_tool)

    config = {
        "voice_server_base_url": "https://example.com",
        "voice_server_api_key": "k",
        "receptionist_id": "rec-1",
    }
    tool_exec = pipeline.make_calendar_tool_exec(
        config=config,
        on_audio=lambda _: None,
        on_error=None,
        tts_failure_logged=[False],
        last_availability_slots={},
    )

    result = await tool_exec("check_availability", {"date_text": "tomorrow"})
    parsed = json.loads(result)
    assert parsed.get("success") is False
    assert parsed.get("error") == "service_selection_required"
    assert "what would you like to book" in (parsed.get("message") or "").lower()


def test_check_availability_tool_schema_has_service_params():
    """Regression: check_availability must expose service_name, service_id, generic_appointment_requested."""
    ca_tool = next(t for t in CALENDAR_TOOLS if t["function"]["name"] == "check_availability")
    props = ca_tool["function"]["parameters"]["properties"]
    assert "service_name" in props
    assert props["service_name"]["type"] == "string"
    assert "service_id" in props
    assert props["service_id"]["type"] == "string"
    assert "generic_appointment_requested" in props
    assert props["generic_appointment_requested"]["type"] == "boolean"


@pytest.mark.asyncio
async def test_check_availability_proceeds_when_service_name_passed(monkeypatch):
    """When model passes service_name, backend proceeds (no service_selection_required)."""
    async def fake_call_calendar_tool(base_url: str, api_key: str, rec_id: str, name: str, args: dict) -> str:
        if name == "check_availability" and not args.get("service_id") and not args.get("service_name") and not args.get("generic_appointment_requested"):
            return json.dumps({
                "success": False,
                "error": "service_selection_required",
                "message": "Sure — what would you like to book?",
            })
        return json.dumps({"success": True, "suggested_slots": ["2026-03-21T10:00:00", "2026-03-21T11:00:00"]})

    monkeypatch.setattr(pipeline, "call_calendar_tool", fake_call_calendar_tool)

    config = {
        "voice_server_base_url": "https://example.com",
        "voice_server_api_key": "k",
        "receptionist_id": "rec-1",
    }
    tool_exec = pipeline.make_calendar_tool_exec(
        config=config,
        on_audio=lambda _: None,
        on_error=None,
        tts_failure_logged=[False],
        last_availability_slots={},
    )

    result = await tool_exec("check_availability", {"date_text": "tomorrow", "service_name": "Business consulting"})
    parsed = json.loads(result)
    assert parsed.get("success") is True
    assert "suggested_slots" in parsed


@pytest.mark.asyncio
async def test_check_availability_proceeds_when_generic_appointment_requested(monkeypatch):
    """When model passes generic_appointment_requested=true, backend proceeds."""
    async def fake_call_calendar_tool(base_url: str, api_key: str, rec_id: str, name: str, args: dict) -> str:
        if name == "check_availability" and not args.get("service_id") and not args.get("service_name") and args.get("generic_appointment_requested") is not True:
            return json.dumps({
                "success": False,
                "error": "service_selection_required",
                "message": "Sure — what would you like to book?",
            })
        return json.dumps({"success": True, "suggested_slots": []})

    monkeypatch.setattr(pipeline, "call_calendar_tool", fake_call_calendar_tool)

    config = {
        "voice_server_base_url": "https://example.com",
        "voice_server_api_key": "k",
        "receptionist_id": "rec-1",
    }
    tool_exec = pipeline.make_calendar_tool_exec(
        config=config,
        on_audio=lambda _: None,
        on_error=None,
        tts_failure_logged=[False],
        last_availability_slots={},
    )

    result = await tool_exec("check_availability", {"date_text": "tomorrow", "generic_appointment_requested": True})
    parsed = json.loads(result)
    assert parsed.get("success") is True

