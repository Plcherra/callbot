from __future__ import annotations

from types import SimpleNamespace

import pytest

from api.mobile import dashboard


class _FakeQuery:
    def __init__(self, table: str):
        self._table = table
        self._select = ""

    def select(self, value: str):
        self._select = value
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self._table == "receptionists":
            return SimpleNamespace(data=[{"id": "rec-1"}])
        if self._table == "user_plans":
            return SimpleNamespace(data=[{"used_inbound_minutes": 1, "used_outbound_minutes": 2}])
        if self._table == "call_logs":
            return SimpleNamespace(
                data=[
                    {
                        "id": "cl-1",
                        "call_control_id": "cc-1",
                        "receptionist_id": "rec-1",
                        "from_number": "+16175550000",
                        "to_number": "+16175551111",
                        "direction": "inbound",
                        "status": "completed",
                        "started_at": "2026-03-26T20:00:00Z",
                        "ended_at": "2026-03-26T20:00:42Z",
                        "duration_seconds": 42,
                        "recording_status": "available",
                        "recording_url": "https://example.test/rec.mp3",
                    }
                ]
            )
        return SimpleNamespace(data=[])


class _FakeSupabase:
    def table(self, name: str):
        return _FakeQuery(name)

    def rpc(self, *_args, **_kwargs):
        return SimpleNamespace(execute=lambda: SimpleNamespace(data={"total_calls": 1, "total_seconds": 42}))


@pytest.mark.asyncio
async def test_dashboard_recent_calls_include_recording_fields(monkeypatch):
    monkeypatch.setattr(dashboard, "_require_auth", lambda _req: ({"id": "user-1"}, _FakeSupabase()))
    out = await dashboard.dashboard_summary(SimpleNamespace())
    assert out["recent_calls"]
    assert out["recent_calls"][0]["recording_status"] == "available"
