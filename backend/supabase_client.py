"""Supabase service role client for backend operations."""

from supabase import create_client, Client

from config import settings


def create_service_role_client() -> Client:
    url = (settings.supabase_url or settings.next_public_supabase_url or "").strip()
    key = (settings.supabase_service_role_key or "").strip()
    if not url or not key:
        raise ValueError(
            "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set"
        )
    return create_client(url, key)
