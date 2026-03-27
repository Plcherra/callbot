from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from telnyx import cdr_webhook


class _FakeCallLogsQuery:
    def __init__(self, state: dict):
        self._state = state
        self._mode = "select"
        self._updates = {}

    def select(self, *_args, **_kwargs):
        self._mode = "select"
        return self

    def update(self, payload: dict):
        self._mode = "update"
        self._updates = payload
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self._mode == "select":
            return SimpleNamespace(
                data=[
                    {
                        "id": "cl-1",
                        "started_at": "2026-03-27T00:00:00+00:00",
                        "answered_at": "2026-03-27T00:00:02+00:00",
                        "recording_consent_played": True,
                        "recording_status": "available",
                        "receptionist_id": "rec-1",
                    }
                ]
            )
        self._state["last_update"] = self._updates
        return SimpleNamespace(data=[{"id": "cl-1"}])


class _FakeSupabase:
    def __init__(self, state: dict):
        self._state = state

    def table(self, name: str):
        if name == "call_logs":
            return _FakeCallLogsQuery(self._state)
        raise AssertionError(f"unexpected table {name}")


def test_finalize_does_not_override_available_recording_status(monkeypatch):
    state: dict = {}
    fake = _FakeSupabase(state)
    monkeypatch.setattr(cdr_webhook, "_infer_outcome", lambda **_kwargs: "completed")

    ended_at = datetime.now(timezone.utc)
    cdr_webhook._finalize_call_log(fake, "cc-1", ended_at, duration_seconds=60)

    assert "last_update" in state
    assert state["last_update"].get("recording_status") is None
