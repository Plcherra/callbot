"""Tests for api.auth - Bearer token validation, 401 never 500."""

import os
from unittest.mock import MagicMock

import pytest

# Set minimal env before importing auth (anon_key needed for verify_bearer_token path)
os.environ.setdefault("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from api.auth import get_bearer_token, get_user_from_request, verify_bearer_token
from fastapi import Request


def _mock_request(headers: dict) -> Request:
    req = MagicMock(spec=Request)
    req.headers = headers
    return req


def test_get_bearer_token_missing():
    """No Authorization header => (None, debug_info)."""
    req = _mock_request({})
    token, info = get_bearer_token(req)
    assert token is None
    assert info["auth_header_present"] is False
    assert info["bearer_prefix_match"] is False


def test_get_bearer_token_bearer():
    """Valid Bearer header => token extracted."""
    req = _mock_request({"Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1LTEyMyJ9.x"})
    token, info = get_bearer_token(req)
    assert token == "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1LTEyMyJ9.x"
    assert info["auth_header_present"] is True
    assert info["bearer_prefix_match"] is True


def test_get_bearer_token_basic():
    """Basic auth => no token, bearer_prefix_match False."""
    req = _mock_request({"Authorization": "Basic xyz"})
    token, info = get_bearer_token(req)
    assert token is None
    assert info["bearer_prefix_match"] is False


def test_get_user_from_request_no_token():
    """No token => (None, None) -> routes return 401."""
    req = _mock_request({})
    user, supabase = get_user_from_request(req)
    assert user is None
    assert supabase is None


def test_get_user_from_request_invalid_token():
    """Invalid token => (None, None) -> 401, never 500."""
    req = _mock_request({"Authorization": "Bearer invalid.jwt.token"})
    user, supabase = get_user_from_request(req)
    assert user is None
    assert supabase is None


def test_verify_bearer_token_empty():
    """Empty token => None."""
    assert verify_bearer_token("") is None
    assert verify_bearer_token("x") is None


def test_verify_bearer_token_invalid():
    """Invalid JWT => None, no exception."""
    result = verify_bearer_token("not-a-valid-jwt")
    assert result is None
