"""Shared Google OAuth scope list.

Keep this as the single source of truth for:
- Auth URL generation (/api/mobile/google-auth-url)
- Callback token exchange (/api/google/callback)
"""

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
]

