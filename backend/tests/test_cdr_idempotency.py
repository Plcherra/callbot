from __future__ import annotations

from types import SimpleNamespace

import pytest

from telnyx import cdr_webhook


class _FakeTable:
    def __init__(self, name: str, state: dict):
        self._name = name
        self._state = state

    def insert(self, row: dict):
        self._state.setdefault("inserts", []).append((self._name, row))
        if self._state.get("raise_duplicate"):
            raise Exception("23505 duplicate key value violates unique constraint")
        return self

    def update(self, row: dict):
        self._state.setdefault("updates", []).append((self._name, row))
        return self

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        # call_logs lookup
        if self._name == "call_logs":
            return SimpleNamespace(data=[{"id": "cl-1", "started_at": "2026-03-17T10:00:00+00:00", "recording_consent_played": False}])
        return SimpleNamespace(data=[])


class _FakeSupabase:
    def __init__(self, state: dict):
        self._state = state

    def table(self, name: str):
        return _FakeTable(name, self._state)

    def rpc(self, name: str, params: dict):
        self._state.setdefault("rpcs", []).append((name, params))
        return self

    def execute(self):
        return SimpleNamespace(data=[])


@pytest.mark.asyncio
async def test_duplicate_call_usage_does_not_increment_user_plan(monkeypatch):
    state: dict = {"raise_duplicate": True}
    monkeypatch.setattr(cdr_webhook, "create_service_role_client", lambda: _FakeSupabase(state))
    monkeypatch.setattr(
        cdr_webhook,
        "get_receptionist_by_did_or_match",
        lambda *_args, **_kwargs: ({"id": "rec-1", "user_id": "user-1"}, "+1555", "+1666"),
    )
    monkeypatch.setattr(cdr_webhook, "extract_call_control_id", lambda *_args, **_kwargs: "call-ctrl-1")
    monkeypatch.setattr(
        cdr_webhook,
        "extract_call_party_numbers",
        lambda *_args, **_kwargs: {
            "from_number": "+1666",
            "to_number": "+1555",
            "direction": "inbound",
            "our_did": "+1555",
            "caller_number": "+1666",
            "raw_direction": "incoming",
        },
    )

    payload = {
        "data": {
            "event_type": "call.hangup",
            "payload": {"call_control_id": "call-ctrl-1", "duration_millis": 60_000},
        }
    }
    out = await cdr_webhook.handle_cdr_webhook(
        raw_body=__import__("json").dumps(payload).encode("utf-8"),
        headers={},
    )
    assert out["received"] is True
    # Duplicate insert should skip increment_user_plan_usage
    assert state.get("rpcs", []) == []

