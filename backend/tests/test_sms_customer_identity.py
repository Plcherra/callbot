"""Unit tests for SMS customer display name and template substitution."""

from __future__ import annotations

from telnyx.sms_customer_identity import (
    SMS_DISPLAY_NAME_FALLBACK,
    apply_sms_template_vars,
    fetch_customer_sms_display_name,
)


def test_apply_sms_template_vars():
    assert apply_sms_template_vars("Hi {business_name}", "Acme") == "Hi Acme"
    assert apply_sms_template_vars(None, "x") is None
    assert apply_sms_template_vars("", "Acme") == ""


def test_apply_sms_template_vars_empty_display_uses_fallback():
    out = apply_sms_template_vars("From {business_name}", "   ")
    assert SMS_DISPLAY_NAME_FALLBACK in out


class _Exec:
    def __init__(self, data):
        self.data = data


class _RQuery:
    def __init__(self, data):
        self._data = data

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        return _Exec(self._data)


class _SBUsers:
    def __init__(self, row: dict | None):
        self._row = row

    def table(self, name: str):
        assert name == "receptionists"
        return _RQuery([self._row] if self._row else [])


def test_fetch_prefers_business_name():
    row = {"name": "Eve", "users": {"business_name": "Mike's Barbershop"}}
    assert fetch_customer_sms_display_name(_SBUsers(row), "r1") == "Mike's Barbershop"


def test_fetch_users_as_list():
    row = {"name": "Eve", "users": [{"business_name": "Shop"}]}
    assert fetch_customer_sms_display_name(_SBUsers(row), "r1") == "Shop"


def test_fetch_falls_back_to_receptionist_name():
    row = {"name": "Eve", "users": {"business_name": ""}}
    assert fetch_customer_sms_display_name(_SBUsers(row), "r1") == "Eve"


def test_fetch_falls_back_when_no_row():
    assert fetch_customer_sms_display_name(_SBUsers(None), "r1") == SMS_DISPLAY_NAME_FALLBACK


def test_fetch_exception_returns_fallback(monkeypatch):
    class _Boom:
        def table(self, _n):
            raise RuntimeError("db down")

    assert fetch_customer_sms_display_name(_Boom(), "r1") == SMS_DISPLAY_NAME_FALLBACK
