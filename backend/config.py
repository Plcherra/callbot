"""Configuration via pydantic-settings. Validates env at startup."""

import logging
import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)
_supabase_deprecation_logged = False

# Load from project root (parent of backend/)
_root = Path(__file__).resolve().parent.parent
_env = _root / ".env"
_env_local = _root / ".env.local"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_env_local) if _env_local.exists() else (str(_env) if _env.exists() else ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Supabase: prefer NEXT_PUBLIC_SUPABASE_URL (canonical), fallback to SUPABASE_URL (deprecated alias)
    supabase_url: str = ""  # Legacy: SUPABASE_URL
    supabase_service_role_key: str = ""
    next_public_supabase_url: str = ""  # Canonical: NEXT_PUBLIC_SUPABASE_URL
    next_public_supabase_anon_key: str = ""  # For JWT validation (outbound, etc.)

    # Telnyx
    telnyx_api_key: str = ""
    telnyx_connection_id: str = ""  # For outbound calls
    telnyx_public_key: str = ""  # For Ed25519 webhook verification
    telnyx_webhook_secret: str = ""  # For HMAC webhook verification
    telnyx_webhook_base_url: str = ""
    telnyx_stream_base_url: str = ""  # Optional: different URL for media stream
    telnyx_skip_verify: bool = False  # Skip webhook signature verification
    telnyx_allowed_ips: str = ""  # Optional comma-separated IPs when TELNYX_SKIP_VERIFY; empty = no allowlist
    telnyx_allow_receptionist_fallback: bool = False  # If True, use first active receptionist when DID unmatched (dangerous; keep False for verification so bad DID matches are not masked)

    # Voice AI (ELEVENLABS_VOICE_ID from env, fallback default)
    deepgram_api_key: str = ""
    grok_api_key: str = ""
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "CwhRBWXzGAHq8TQ4Fs17"  # Env: ELEVENLABS_VOICE_ID

    # Voice server
    voice_server_api_key: str = ""
    voice_prompt_base_url: str = ""  # Maps to VOICE_PROMPT_BASE_URL

    # App API (Next.js) for FCM push, quota checks
    app_api_base_url: str = ""
    internal_api_key: str = ""
    next_public_app_url: str = ""  # Fallback for app_api_base_url when co-located

    # Cron: optional, for triggering Next.js billing cron from this backend
    cron_secret: str = ""

    # Firebase (for backend FCM push)
    firebase_service_account_key: str = ""

    # Google Calendar OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""
    next_public_google_redirect_uri: str = ""  # Alias for NEXT_PUBLIC_GOOGLE_REDIRECT_URI
    google_oauth_state_secret: str = ""  # For HMAC signing of OAuth state (fallback: supabase_service_role_key)

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # Mobile app
    mobile_redirect_scheme: str = "echodesk"
    app_url: str = ""  # NEXT_PUBLIC_APP_URL or APP_URL for redirects

    # App
    port: int = 8000

    def model_post_init(self, __context) -> None:
        # Resolve app_api_base_url: fallback to NEXT_PUBLIC_APP_URL when unset
        if not self.app_api_base_url.strip() and self.next_public_app_url.strip():
            self.app_api_base_url = self.next_public_app_url.strip()
            logger.info(
                "APP_API_BASE_URL defaulting to NEXT_PUBLIC_APP_URL (%s)",
                self.app_api_base_url[:50],
            )
        # Resolve app_url for redirects
        if not self.app_url.strip() and self.next_public_app_url.strip():
            self.app_url = self.next_public_app_url.strip()

    def get_supabase_url(self) -> str:
        """Resolved Supabase URL. Prefer NEXT_PUBLIC_SUPABASE_URL, fallback to SUPABASE_URL (deprecated)."""
        global _supabase_deprecation_logged
        url = (self.next_public_supabase_url or self.supabase_url or "").strip()
        if self.supabase_url.strip() and not self.next_public_supabase_url.strip():
            if not _supabase_deprecation_logged:
                _supabase_deprecation_logged = True
                logger.warning(
                    "SUPABASE_URL is deprecated; use NEXT_PUBLIC_SUPABASE_URL instead"
                )
        return url

    def get_google_redirect_uri(self) -> str:
        return (self.google_redirect_uri or self.next_public_google_redirect_uri or "").strip()

    def get_app_url(self) -> str:
        return (self.app_url or self.next_public_app_url or "http://localhost:3000").strip().rstrip("/")

    def get_telnyx_ws_base(self) -> str:
        base = (
            (self.telnyx_stream_base_url or self.telnyx_webhook_base_url or "http://localhost:8000")
        ).rstrip("/")
        return base.replace("https://", "wss://").replace("http://", "ws://")

    def validate_voice_keys(self) -> None:
        """Fail fast if required voice keys missing."""
        missing = []
        if not self.deepgram_api_key:
            missing.append("DEEPGRAM_API_KEY")
        if not self.grok_api_key:
            missing.append("GROK_API_KEY")
        if not self.elevenlabs_api_key:
            missing.append("ELEVENLABS_API_KEY")
        if missing:
            raise ValueError(f"Missing required env vars: {', '.join(missing)}")

    def validate_supabase(self) -> None:
        """Fail fast if Supabase config missing."""
        url = self.get_supabase_url()
        key = (self.supabase_service_role_key or "").strip()
        anon_key = (self.next_public_supabase_anon_key or "").strip()
        if not url or not key:
            raise ValueError(
                "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set"
            )
        if not anon_key:
            raise ValueError(
                "NEXT_PUBLIC_SUPABASE_ANON_KEY must be set for /api/mobile JWT auth"
            )

    def validate_telnyx(self) -> None:
        """Fail fast if Telnyx API key missing (needed for voice webhook)."""
        if not (self.telnyx_api_key or "").strip():
            raise ValueError("TELNYX_API_KEY must be set for voice webhook")


settings = Settings()
