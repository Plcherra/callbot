from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi.responses import JSONResponse

from api import mobile_routes


class _RecordingUrlFakeQuery:
    def __init__(self, table: str, scenario: str):
        self._table = table
        self._scenario = scenario
        self._filters: dict = {}

    def select(self, _value: str):
        return self

    def eq(self, key: str, value):
        self._filters[key] = value
        return self

    def limit(self, _n: int):
        return self

    def execute(self):
        if self._table == "receptionists":
            if self._scenario == "wrong_owner":
                return SimpleNamespace(data=[{"id": "rec-1", "user_id": "other-user"}])
            return SimpleNamespace(data=[{"id": "rec-1", "user_id": "user-1"}])

        if self._table == "call_logs":
            if self._scenario == "not_found":
                return SimpleNamespace(data=[])
            if self._scenario == "not_available":
                return SimpleNamespace(
                    data=[
                        {
                            "id": "cl-1",
                            "receptionist_id": "rec-1",
                            "call_control_id": "cc-1",
                            "recording_status": "processing",
                            "telnyx_recording_id": None,
                        }
                    ]
                )
            return SimpleNamespace(
                data=[
                    {
                        "id": "cl-1",
                        "receptionist_id": "rec-1",
                        "call_control_id": "cc-1",
                        "recording_status": "available",
                        "telnyx_recording_id": "telnyx-rec-uuid",
                    }
                ]
            )

        return SimpleNamespace(data=[])


class _RecordingUrlFakeSupabase:
    def __init__(self, scenario: str = "ok"):
        self.scenario = scenario

    def table(self, name: str):
        return _RecordingUrlFakeQuery(name, self.scenario)


@pytest.mark.asyncio
async def test_recording_url_404_wrong_owner(monkeypatch):
    fake = _RecordingUrlFakeSupabase("wrong_owner")
    monkeypatch.setattr(mobile_routes, "_require_auth", lambda _req: ({"id": "user-1"}, fake))

    request = SimpleNamespace()
    out = await mobile_routes.get_call_recording_url(request, "rec-1", "cl-1")

    assert isinstance(out, JSONResponse)
    assert out.status_code == 404


@pytest.mark.asyncio
async def test_recording_url_404_missing_call(monkeypatch):
    fake = _RecordingUrlFakeSupabase("not_found")
    monkeypatch.setattr(mobile_routes, "_require_auth", lambda _req: ({"id": "user-1"}, fake))

    request = SimpleNamespace()
    out = await mobile_routes.get_call_recording_url(request, "rec-1", "cl-1")

    assert isinstance(out, JSONResponse)
    assert out.status_code == 404


@pytest.mark.asyncio
async def test_recording_url_409_when_not_available(monkeypatch):
    fake = _RecordingUrlFakeSupabase("not_available")
    monkeypatch.setattr(mobile_routes, "_require_auth", lambda _req: ({"id": "user-1"}, fake))

    request = SimpleNamespace()
    out = await mobile_routes.get_call_recording_url(request, "rec-1", "cl-1")

    assert isinstance(out, JSONResponse)
    assert out.status_code == 409


@pytest.mark.asyncio
async def test_recording_url_200_returns_fresh_url(monkeypatch):
    fake = _RecordingUrlFakeSupabase("ok")

    async def _fetch(**kwargs):
        assert kwargs["telnyx_recording_id"] == "telnyx-rec-uuid"
        assert kwargs["call_control_id"] == "cc-1"
        return "https://cdn.example/fresh.mp3?X-Amz-Expires=600"

    monkeypatch.setattr(mobile_routes, "_require_auth", lambda _req: ({"id": "user-1"}, fake))
    monkeypatch.setattr(mobile_routes, "fetch_fresh_recording_mp3_url", _fetch)

    request = SimpleNamespace()
    out = await mobile_routes.get_call_recording_url(request, "rec-1", "cl-1")

    assert out == {"url": "https://cdn.example/fresh.mp3?X-Amz-Expires=600"}


@pytest.mark.asyncio
async def test_recording_url_502_when_telnyx_returns_none(monkeypatch):
    fake = _RecordingUrlFakeSupabase("ok")

    async def _fetch(**_kwargs):
        return None

    monkeypatch.setattr(mobile_routes, "_require_auth", lambda _req: ({"id": "user-1"}, fake))
    monkeypatch.setattr(mobile_routes, "fetch_fresh_recording_mp3_url", _fetch)

    request = SimpleNamespace()
    out = await mobile_routes.get_call_recording_url(request, "rec-1", "cl-1")

    assert isinstance(out, JSONResponse)
    assert out.status_code == 502
