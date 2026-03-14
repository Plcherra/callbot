"""Auth helper: validate Bearer token and return user + supabase client.

Flutter and backend must use the same Supabase project (same URL and anon key).
Mismatch causes JWT signed by project A to fail when validated by project B.
"""

from __future__ import annotations

import base64
import json
import logging
import time
from typing import TYPE_CHECKING, Any

from fastapi import Request
from supabase import create_client

from config import settings
from supabase_client import create_service_role_client

if TYPE_CHECKING:
    from supabase import Client

logger = logging.getLogger(__name__)

# Normalized user shape returned by verify_bearer_token (id, email at minimum).
UserDict = dict[str, Any]


def _peek_exp_for_logging(token: str) -> tuple[int | None, bool]:
    """Decode JWT payload without verification to read exp for logging. Returns (exp_ts, is_expired)."""
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return (None, False)
        payload_b64 = parts[1]
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        exp = payload.get("exp")
        if exp is None:
            return (None, False)
        is_expired = int(exp) < int(time.time())
        return (int(exp), is_expired)
    except Exception:
        return (None, False)


def get_bearer_token(request: Request) -> tuple[str | None, dict[str, Any]]:
    """
    Extract Bearer token from Authorization header.
    Returns (token, debug_info) where debug_info has auth_header_present, bearer_prefix_match.
    """
    auth = request.headers.get("authorization") or request.headers.get("Authorization") or ""
    debug_info = {
        "auth_header_present": bool(auth),
        "bearer_prefix_match": auth.strip().lower().startswith("bearer "),
    }
    if not auth.startswith("Bearer "):
        return None, debug_info
    token = auth[7:].strip() or None
    return token, debug_info


def _normalize_user(id_val: str, email: Any = None) -> UserDict:
    """Return normalized user dict with id and email. Ensures same shape from get_claims and get_user."""
    return {
        "id": str(id_val) if id_val else "",
        "email": str(email) if email else None,
    }


def verify_bearer_token(token: str) -> UserDict | None:
    """
    Validate JWT and return normalized user dict or None.
    Shared by get_user_from_request and outbound. Never raises; invalid/missing token => None.
    Normalized shape: {id, email} from both get_claims and get_user.
    """
    url = settings.get_supabase_url()
    anon_key = (settings.next_public_supabase_anon_key or "").strip()

    token_prefix = (token[:20] + "...") if token and len(token) > 20 else "(empty or short)"
    exp_ts, token_expired = _peek_exp_for_logging(token)

    logger.info(
        "[AUTH] verify_bearer_token: token_prefix=%s supabase_url=%s anon_key_present=%s token_expired=%s exp=%s",
        token_prefix,
        url or "(empty)",
        bool(anon_key),
        token_expired,
        exp_ts,
    )

    if not url or not anon_key:
        logger.info("[AUTH] Rejection: no_url=%s no_anon_key=%s", not url, not anon_key)
        return None

    try:
        client = create_client(url, anon_key)

        # Primary: get_claims (works with new Supabase JWT signing keys)
        try:
            resp = client.auth.get_claims(token)
            claims = getattr(resp, "claims", resp) if resp is not None else None
            if isinstance(claims, dict):
                sub = claims.get("sub")
                email = claims.get("email")
                if sub:
                    logger.info("[AUTH] Verification method=get_claims user_id=%s", sub)
                    return _normalize_user(str(sub), email)
            # Handle response object with nested structure
            if hasattr(resp, "model_dump"):
                data = resp.model_dump()
                claims = data.get("claims", data)
            elif hasattr(resp, "dict"):
                data = resp.dict()
                claims = data.get("claims", data)
            else:
                claims = resp
            if isinstance(claims, dict) and claims.get("sub"):
                logger.info("[AUTH] Verification method=get_claims user_id=%s", claims.get("sub"))
                return _normalize_user(str(claims["sub"]), claims.get("email"))
        except AttributeError as e:
            logger.info("[AUTH] get_claims not available, trying get_user: %s", e)
        except Exception as e:
            logger.info("[AUTH] get_claims failed: %s", e)

        # Fallback: get_user(token)
        try:
            resp = client.auth.get_user(token)
            user = getattr(resp, "user", None) if resp else None
            if user:
                uid = getattr(user, "id", None) or (user.get("id") if isinstance(user, dict) else None)
                email = getattr(user, "email", None) or (user.get("email") if isinstance(user, dict) else None)
                if uid:
                    logger.info("[AUTH] Verification method=get_user user_id=%s", uid)
                    return _normalize_user(str(uid), email)
        except Exception as e:
            logger.info("[AUTH] get_user failed: %s", e)

    except Exception as e:
        logger.info("[AUTH] Rejection: %s", e)

    return None


def get_user_from_request(request: Request) -> tuple[UserDict | None, "Client | None"]:
    """
    Validate Bearer token and return (user, supabase) or (None, None).
    Invalid or missing token => (None, None) => routes return 401, never 500.
    """
    token, debug_info = get_bearer_token(request)

    logger.info(
        "[AUTH] get_user_from_request: auth_header_present=%s bearer_prefix_match=%s has_token=%s",
        debug_info["auth_header_present"],
        debug_info["bearer_prefix_match"],
        bool(token),
    )

    if not token:
        logger.info("[AUTH] Rejection: no_token (missing header or not Bearer)")
        return None, None

    user = verify_bearer_token(token)
    if not user:
        return None, None

    try:
        supabase = create_service_role_client()
        return user, supabase
    except Exception as e:
        logger.warning("[AUTH] create_service_role_client failed: %s", e)
        return None, None
