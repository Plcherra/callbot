"""Tests for service name normalization and resolution in _booking.py."""

from __future__ import annotations

import pytest

from calendar_api._booking import (
    _normalize_service_name,
    _resolve_service_for_booking,
)


def test_normalize_service_name_lowercase_trim():
    assert _normalize_service_name("  Consultation  ") == "consultation"


def test_normalize_service_name_collapse_spaces():
    assert _normalize_service_name("Initial   Consultation") == "initial consultation"


def test_normalize_service_name_remove_punctuation():
    assert _normalize_service_name("Consultation.") == "consultation"
    assert _normalize_service_name("House-Cleaning") == "housecleaning"
    assert _normalize_service_name("(30 min)") == "30 min"


def test_normalize_service_name_empty():
    assert _normalize_service_name("") == ""
    assert _normalize_service_name(None) == ""


class _MockSB:
    def __init__(self, services: list[dict]):
        self._services = services
        self._filters: dict[str, str] = {}
        self._limit: int | None = None

    def table(self, name: str):
        assert name == "services"
        return self

    def select(self, _fields: str):
        return self

    def eq(self, key: str, value: str):
        self._filters[key] = value
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    def execute(self):
        out = self._services
        for k, v in self._filters.items():
            out = [r for r in out if r.get(k) == v]
        if self._limit is not None:
            out = out[: self._limit]
        return type("R", (), {"data": out})()


def test_resolve_service_exact_normalized_match():
    services = [
        {"id": "svc-1", "receptionist_id": "rec-1", "name": "Consultation", "duration_minutes": 60, "price_cents": 10000},
    ]
    sb = _MockSB(services)
    result = _resolve_service_for_booking(
        supabase=sb,
        receptionist_id="rec-1",
        service_id=None,
        service_name="Consultation",
    )
    assert result is not None
    assert result["id"] == "svc-1"
    assert result["name"] == "Consultation"


def test_resolve_service_case_insensitive():
    services = [
        {"id": "svc-1", "receptionist_id": "rec-1", "name": "Consultation", "duration_minutes": 60},
    ]
    sb = _MockSB(services)
    result = _resolve_service_for_booking(
        supabase=sb,
        receptionist_id="rec-1",
        service_id=None,
        service_name="consultation",
    )
    assert result is not None
    assert result["id"] == "svc-1"


def test_resolve_service_contained_unambiguous():
    services = [
        {"id": "svc-1", "receptionist_id": "rec-1", "name": "Initial Consultation", "duration_minutes": 60},
    ]
    sb = _MockSB(services)
    result = _resolve_service_for_booking(
        supabase=sb,
        receptionist_id="rec-1",
        service_id=None,
        service_name="Consultation",
    )
    assert result is not None
    assert result["id"] == "svc-1"
    assert result["name"] == "Initial Consultation"


def test_resolve_service_contained_ambiguous_no_match():
    services = [
        {"id": "svc-1", "receptionist_id": "rec-1", "name": "Initial Consultation", "duration_minutes": 60},
        {"id": "svc-2", "receptionist_id": "rec-1", "name": "Follow-up Consultation", "duration_minutes": 30},
    ]
    sb = _MockSB(services)
    result = _resolve_service_for_booking(
        supabase=sb,
        receptionist_id="rec-1",
        service_id=None,
        service_name="Consultation",
    )
    assert result is None


def test_resolve_service_no_match():
    services = [
        {"id": "svc-1", "receptionist_id": "rec-1", "name": "House Cleaning", "duration_minutes": 60},
    ]
    sb = _MockSB(services)
    result = _resolve_service_for_booking(
        supabase=sb,
        receptionist_id="rec-1",
        service_id=None,
        service_name="Consultation",
    )
    assert result is None


def test_resolve_service_by_id():
    services = [
        {"id": "svc-1", "receptionist_id": "rec-1", "name": "Consultation", "duration_minutes": 60},
    ]
    sb = _MockSB(services)
    result = _resolve_service_for_booking(
        supabase=sb,
        receptionist_id="rec-1",
        service_id="svc-1",
        service_name=None,
    )
    assert result is not None
    assert result["id"] == "svc-1"


def test_resolve_service_asr_variant_consultant_to_consulting():
    """ASR may transcribe 'consulting' as 'consultant'; stem match should resolve when unambiguous."""
    services = [
        {"id": "svc-1", "receptionist_id": "rec-1", "name": "Business consulting", "duration_minutes": 60},
    ]
    sb = _MockSB(services)
    result = _resolve_service_for_booking(
        supabase=sb,
        receptionist_id="rec-1",
        service_id=None,
        service_name="business consultant",
    )
    assert result is not None
    assert result["id"] == "svc-1"
    assert result["name"] == "Business consulting"


def test_resolve_service_asr_variant_consulting_contained():
    """'consulting' is contained in 'Business consulting'; should resolve when only one service."""
    services = [
        {"id": "svc-1", "receptionist_id": "rec-1", "name": "Business consulting", "duration_minutes": 60},
    ]
    sb = _MockSB(services)
    result = _resolve_service_for_booking(
        supabase=sb,
        receptionist_id="rec-1",
        service_id=None,
        service_name="consulting",
    )
    assert result is not None
    assert result["id"] == "svc-1"
    assert result["name"] == "Business consulting"


def test_resolve_service_asr_variant_consultation_stem_match():
    """'consultation' stems to 'consult'; 'Business consulting' stems to 'business consult'; stem contained match."""
    services = [
        {"id": "svc-1", "receptionist_id": "rec-1", "name": "Business consulting", "duration_minutes": 60},
    ]
    sb = _MockSB(services)
    result = _resolve_service_for_booking(
        supabase=sb,
        receptionist_id="rec-1",
        service_id=None,
        service_name="consultation",
    )
    assert result is not None
    assert result["id"] == "svc-1"
    assert result["name"] == "Business consulting"
