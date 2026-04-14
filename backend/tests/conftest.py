"""Pytest configuration and fixtures.

Sets required env vars before app import so startup validation passes.
"""

import os
from unittest.mock import patch

import pytest

# Set required env before any app imports (load_dotenv won't override)
for key, val in [
    ("DEEPGRAM_API_KEY", "test-dg-key"),
    ("GROK_API_KEY", "test-grok-key"),
    ("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co"),
    ("SUPABASE_SERVICE_ROLE_KEY", "test-supabase-key"),
    ("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key"),
    ("TELNYX_API_KEY", "test-telnyx-key"),
]:
    os.environ.setdefault(key, val)


@pytest.fixture(autouse=True)
def _mock_google_tts_credentials():
    """Mock Google TTS credential check so tests run without ADC."""
    with patch("voice.google_credentials.validate_google_tts_credentials"):
        yield
