from __future__ import annotations

from types import SimpleNamespace

import pytest

from api import mobile_routes


class _FakeQuery:
    def __init__(self, table: str, state: dict):
        self._table = table
        self._state = state
        self._select = ""
        self._filters = {}

    def select(self, value: str):
        self._select = value
        return self

    def eq(self, key: str, value):
        self._filters[key] = value
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self._table == "receptionists":
            return SimpleNamespace(data=[{"id": "rec-1", "user_id": "user-1"}])

        if self._table == "call_logs":
            self._state.setdefault("selects", []).append(self._select)
            if "recording_status" in self._select:
                raise Exception(
                    "{'message': \"Could not find the 'recording_status' column of 'call_logs' in the schema cache\", 'code': 'PGRST204'}"
                )
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
                        "duration_seconds": 42,
                    }
                ]
            )

        if self._table == "appointments":
            return SimpleNamespace(data=[])

        return SimpleNamespace(data=[])


class _FakeSupabase:
    def __init__(self):
        self.state = {}

    def table(self, name: str):
        return _FakeQuery(name, self.state)


@pytest.mark.asyncio
async def test_call_history_falls_back_from_full_to_core(monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr(mobile_routes, "_require_auth", lambda _req: ({"id": "user-1"}, fake))

    request = SimpleNamespace(query_params={"limit": "20", "offset": "0"})
    out = await mobile_routes.get_call_history(request, receptionist_id="rec-1")

    assert out["calls"]
    assert out["degraded"] is True
    assert out["select_mode"] == "extended"
    assert any("recording_status" in s for s in fake.state["selects"])


@pytest.mark.asyncio
async def test_call_history_returns_structured_500_on_query_error(monkeypatch):
    class _ExplodingSupabase(_FakeSupabase):
        def table(self, name: str):
            query = super().table(name)
            if name == "call_logs":
                def _boom():
                    raise Exception("network timeout")

                query.execute = _boom
            return query

    fake = _ExplodingSupabase()
    monkeypatch.setattr(mobile_routes, "_require_auth", lambda _req: ({"id": "user-1"}, fake))
    request = SimpleNamespace(query_params={"limit": "20", "offset": "0"})

    out = await mobile_routes.get_call_history(request, receptionist_id="rec-1")
    assert out.status_code == 500
    assert out.body
