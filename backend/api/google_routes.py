"""Google OAuth callback for Calendar connection."""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import Request
from fastapi.responses import RedirectResponse

from config import settings
from supabase_client import create_service_role_client

logger = logging.getLogger(__name__)


async def google_callback_get(request: Request):
    """Handle Google OAuth callback. Exchange code for tokens, save to users, redirect to app."""
    redirect_uri = settings.get_google_redirect_uri()
    client_id = (settings.google_client_id or "").strip()
    client_secret = (settings.google_client_secret or "").strip()
    if not redirect_uri or not client_id or not client_secret:
        logger.error("[Google callback] Missing OAuth config")
        return _redirect_error("Server configuration error")

    code = request.query_params.get("code")
    raw_state = request.query_params.get("state")
    error = request.query_params.get("error")
    if error:
        return _redirect_error(f"OAuth error: {error}")
    if not code:
        return _redirect_error("Missing authorization code")
    if not raw_state:
        return _redirect_error("Missing state parameter")

    parts = raw_state.split(":")
    user_id = parts[0] if parts else raw_state
    return_to = parts[1] if len(parts) > 1 else "dashboard"

    supabase = create_service_role_client()
    r = supabase.table("users").select("id").eq("id", user_id).limit(1).execute()
    if not r.data or len(r.data) == 0:
        return _redirect_error("Invalid user", return_to)

    try:
        from google_auth_oauthlib.flow import Flow
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [redirect_uri],
                }
            },
            scopes=[
                "https://www.googleapis.com/auth/calendar",
                "https://www.googleapis.com/auth/calendar.events",
                "email",
                "profile",
            ],
            redirect_uri=redirect_uri,
        )
        flow.fetch_token(code=code)
        credentials = flow.credentials
        if not credentials.refresh_token:
            return _redirect_error("No refresh token received. Please try connecting again and grant all permissions.", return_to)

        oauth2 = build("oauth2", "v2", credentials=credentials)
        userinfo = oauth2.userinfo().get().execute()
        calendar_id = userinfo.get("email", "primary") or "primary"

        supabase.table("users").update({
            "calendar_id": calendar_id,
            "calendar_refresh_token": credentials.refresh_token,
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }).eq("id", user_id).execute()
        logger.info("[Google callback] Connected calendar for user %s", user_id)

        scheme = settings.mobile_redirect_scheme
        is_mobile = return_to in ("mobile", "settings")
        if is_mobile:
            return RedirectResponse(url=f"{scheme}://google-callback?success=1")
        app_url = settings.get_app_url()
        path = "/onboarding" if return_to == "onboarding" else ("/receptionists" if return_to == "receptionists" else "/dashboard")
        return RedirectResponse(url=f"{app_url}{path}?calendar=connected")
    except Exception as e:
        logger.exception("[Google callback] %s", e)
        return _redirect_error(f"Connection failed: {e}", return_to)


def _redirect_error(msg: str, return_to: str = "dashboard"):
    scheme = settings.mobile_redirect_scheme
    app_url = settings.get_app_url()
    is_mobile = return_to in ("mobile", "settings")
    if is_mobile:
        return RedirectResponse(url=f"{scheme}://google-callback?success=0&error={_encode(msg)}")
    path = "/onboarding" if return_to == "onboarding" else ("/receptionists" if return_to == "receptionists" else "/dashboard")
    return RedirectResponse(url=f"{app_url}{path}?calendar=error&message={_encode(msg)}")


def _encode(s: str) -> str:
    from urllib.parse import quote
    return quote(s, safe="")
