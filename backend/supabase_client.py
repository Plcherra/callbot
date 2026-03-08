"""Supabase service role client for backend operations."""

from supabase import create_client, Client

from config import settings


def create_service_role_client() -> Client:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )
