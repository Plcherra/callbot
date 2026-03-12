"""Auth helper: validate Bearer token and return user + supabase client."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from fastapi import Request
from supabase import create_client

from config import settings
from supabase_client import create_service_role_client

if TYPE_CHECKING:
    from supabase import Client


def get_bearer_token(request: Request) -> str | None:
    """Extract Bearer token from Authorization header."""
    auth = request.headers.get("authorization") or request.headers.get("Authorization") or ""
    if not auth.startswith("Bearer "):
        return None
    return auth[7:].strip() or None


def get_user_from_request(request: Request) -> tuple[dict[str, Any] | None, "Client | None"]:
    """
    Validate Bearer token and return (user, supabase) or (None, None).
    Uses Supabase anon client with token to validate JWT.
    """
    token = get_bearer_token(request)
    if not token:
        return None, None

    url = settings.get_supabase_url()
    anon_key = (settings.next_public_supabase_anon_key or "").strip()
    if not url or not anon_key:
        return None, None

    try:
        client = create_client(url, anon_key, options={
            "global": {"headers": {"Authorization": f"Bearer {token}"}},
        })
        resp = client.auth.get_user()
        user = getattr(resp, "user", None) if resp else None
        if user:
            user_dict = {
                "id": str(getattr(user, "id", "")),
                "email": getattr(user, "email", None),
            }
            # Return service role client for DB operations (same as Next.js)
            supabase = create_service_role_client()
            return user_dict, supabase
    except Exception:
        pass
    return None, None
