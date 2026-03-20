"""Tests for service-first orchestration guard in calendar_handler."""

from __future__ import annotations

import pytest

from calendar_api import calendar_handler


class _MockSupabase:
    def __init__(self, services: list[dict]):
        self._services = services

    def table(self, name: str):
        assert name == "services"
        return self

    def select(self, fields: str):
        assert "id" in fields
        return self

    def eq(self, key: str, value: str):
        assert key == "receptionist_id"
        return self

    def execute(self):
        return type("R", (), {"data": self._services})()


def test_check_availability_returns_service_selection_required_when_services_exist():
    sb = _MockSupabase([{"id": "svc-1"}])
    result = calendar_handler._check_service_first_guard(
        supabase=sb,
        receptionist_id="rec-1",
        params={"date_text": "tomorrow"},
    )
    assert result is not None
    assert result["success"] is False
    assert result["error"] == "service_selection_required"
    assert "what would you like to book" in result["message"].lower()


def test_check_availability_proceeds_when_service_name_provided():
    sb = _MockSupabase([{"id": "svc-1"}])
    result = calendar_handler._check_service_first_guard(
        supabase=sb,
        receptionist_id="rec-1",
        params={"date_text": "tomorrow", "service_name": "Consultation"},
    )
    assert result is None


def test_check_availability_proceeds_when_service_id_provided():
    sb = _MockSupabase([{"id": "svc-1"}])
    result = calendar_handler._check_service_first_guard(
        supabase=sb,
        receptionist_id="rec-1",
        params={"date_text": "tomorrow", "service_id": "svc-1"},
    )
    assert result is None


def test_check_availability_proceeds_when_generic_confirmed():
    sb = _MockSupabase([{"id": "svc-1"}])
    result = calendar_handler._check_service_first_guard(
        supabase=sb,
        receptionist_id="rec-1",
        params={"date_text": "tomorrow", "generic_appointment_requested": True},
    )
    assert result is None


def test_check_availability_proceeds_when_no_services():
    sb = _MockSupabase([])
    result = calendar_handler._check_service_first_guard(
        supabase=sb,
        receptionist_id="rec-1",
        params={"date_text": "tomorrow"},
    )
    assert result is None
