from __future__ import annotations

import json

import pytest

from telnyx import voice_webhook


@pytest.mark.asyncio
async def test_voice_webhook_forwards_call_cost_to_cdr(monkeypatch):
    called = {"count": 0}

    async def _fake_cdr(_raw_body: bytes, _headers: dict[str, str]):
        called["count"] += 1
        return {"received": True}

    monkeypatch.setattr("telnyx.cdr_webhook.handle_cdr_webhook", _fake_cdr)
    monkeypatch.setattr(voice_webhook, "create_service_role_client", lambda: object())

    payload = {
        "data": {
            "event_type": "call.cost",
            "payload": {
                "call_control_id": "cc-1",
                "from": "+16175550000",
                "to": "+16175551111",
            },
        }
    }
    out = await voice_webhook.handle_voice_webhook(
        body=payload,
        raw_body=json.dumps(payload).encode("utf-8"),
        headers={},
    )
    assert out == {"received": True}
    assert called["count"] == 1
