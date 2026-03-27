"""Unit tests for TELNYX_ALLOWED_IPS CIDR + exact (no FastAPI app import)."""

import pytest

from telnyx import voice_webhook_verify as vv


@pytest.fixture(autouse=True)
def clear_ip_cache():
    vv._allowed_ip_cache = None
    yield
    vv._allowed_ip_cache = None


def test_exact_ip_only(monkeypatch):
    monkeypatch.setattr("telnyx.voice_webhook_verify.settings.telnyx_allowed_ips", "192.168.1.1")
    assert vv.client_ip_in_allowed_list("192.168.1.1") is True
    assert vv.client_ip_in_allowed_list("192.168.1.2") is False


def test_cidr_subnet(monkeypatch):
    monkeypatch.setattr("telnyx.voice_webhook_verify.settings.telnyx_allowed_ips", "192.76.120.0/24")
    assert vv.client_ip_in_allowed_list("192.76.120.128") is True
    assert vv.client_ip_in_allowed_list("192.76.121.1") is False


def test_mixed_exact_and_cidr(monkeypatch):
    monkeypatch.setattr(
        "telnyx.voice_webhook_verify.settings.telnyx_allowed_ips",
        "127.0.0.1,10.0.0.0/8",
    )
    assert vv.client_ip_in_allowed_list("127.0.0.1") is True
    assert vv.client_ip_in_allowed_list("10.5.5.5") is True


def test_telnyx_allowlist_configured_empty(monkeypatch):
    monkeypatch.setattr("telnyx.voice_webhook_verify.settings.telnyx_allowed_ips", "  ")
    assert vv._telnyx_allowlist_configured() is False
