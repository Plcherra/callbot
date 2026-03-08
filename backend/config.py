"""Configuration via pydantic-settings. Validates env at startup."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

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

    # Supabase
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # Telnyx
    telnyx_api_key: str = ""
    telnyx_public_key: str = ""  # For Ed25519 webhook verification
    telnyx_webhook_secret: str = ""  # For HMAC webhook verification
    telnyx_webhook_base_url: str = ""

    # Voice AI
    deepgram_api_key: str = ""
    grok_api_key: str = ""
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"

    # Voice server
    voice_server_api_key: str = ""
    voice_prompt_base_url: str = ""

    # App API (Next.js) for FCM push (fallback when not using backend FCM)
    app_api_base_url: str = ""
    internal_api_key: str = ""

    # Cron: optional, for triggering Next.js billing cron from this backend
    cron_secret: str = ""

    # Firebase (for backend FCM push)
    firebase_service_account_key: str = ""  # JSON string of service account credentials

    # Google Calendar
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""

    # App
    port: int = 8000

    def get_telnyx_ws_base(self) -> str:
        base = (self.telnyx_webhook_base_url or "http://localhost:8000").rstrip("/")
        return base.replace("https://", "wss://").replace("http://", "ws://")

    def validate_voice_keys(self) -> None:
        """Fail fast if required keys missing."""
        missing = []
        if not self.deepgram_api_key:
            missing.append("DEEPGRAM_API_KEY")
        if not self.grok_api_key:
            missing.append("GROK_API_KEY")
        if not self.elevenlabs_api_key:
            missing.append("ELEVENLABS_API_KEY")
        if missing:
            raise ValueError(f"Missing required env vars: {', '.join(missing)}")


settings = Settings()
