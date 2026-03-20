"""Tests for caller phone normalization before E.164 validation in _booking.py."""

from __future__ import annotations

import pytest

from calendar_api._booking import (
    _normalize_phone,
    _is_e164,
)


def test_normalize_phone_e164_valid():
    assert _normalize_phone("+1 617 653 7747") == "+16176537747"
    assert _is_e164(_normalize_phone("+1 617 653 7747"))


def test_normalize_phone_with_parens_dashes():
    assert _normalize_phone("+1 (617) 653-7747") == "+16176537747"
    assert _is_e164(_normalize_phone("+1 (617) 653-7747"))


def test_normalize_phone_with_dots():
    assert _normalize_phone("+1.617.653.7747") == "+16176537747"


def test_normalize_phone_keeps_leading_plus():
    assert _normalize_phone("+16176537747") == "+16176537747"


def test_normalize_phone_invalid_still_invalid():
    # Non-digits only -> None
    assert _normalize_phone("abc") is None
    assert _normalize_phone("") is None
    assert _normalize_phone(None) is None


def test_normalize_phone_too_short_after_normalize():
    # "+123" normalizes to "+123" but is not valid E.164 (need 10-15 digits)
    assert _normalize_phone("+123") == "+123"
    assert not _is_e164("+123")


def test_sms_sent_when_normalized_valid(monkeypatch):
    """Integration-style: create_appointment with raw phone containing spaces sends SMS."""
    from telnyx import sms as sms_mod

    from calendar_api import calendar_handler
    from tests.test_calendar_tools_contract import _SB, _Service

    calls: list[dict] = []

    def _fake_send_sms(*, to_number: str, from_number: str, text: str) -> dict:
        calls.append({"to": to_number, "from": from_number, "text": text})
        return {"success": True, "telnyx_message_id": "msg-1"}

    monkeypatch.setattr(sms_mod, "send_sms", _fake_send_sms)

    freebusy = {"calendars": {"primary": {"busy": []}}}
    capture: dict = {
        "telnyx_phone_number": "+15551234567",
    }
    service = _Service(freebusy_result=freebusy, event={"id": "evt-1"}, capture=capture)
    sb = _SB(
        services=[],
        capture=capture,
    )

    out = calendar_handler._handle_create_appointment(
        service,
        "primary",
        params={
            "summary": "Test",
            "start_time": "2026-03-17T10:00:00+00:00",
            "duration_minutes": 30,
            "caller_phone": "+1 617 653 7747",
        },
        receptionist_id="rec-1",
        supabase=sb,
    )
    assert out["success"] is True
    assert len(calls) == 1
    assert calls[0]["to"] == "+16176537747"
