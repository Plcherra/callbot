"""Pytest configuration and fixtures.

Sets required env vars before app import so startup validation passes.
"""

import os

# Set required env before any app imports (load_dotenv won't override)
for key, val in [
    ("DEEPGRAM_API_KEY", "test-dg-key"),
    ("GROK_API_KEY", "test-grok-key"),
    ("ELEVENLABS_API_KEY", "test-el-key"),
    ("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co"),
    ("SUPABASE_SERVICE_ROLE_KEY", "test-supabase-key"),
    ("TELNYX_API_KEY", "test-telnyx-key"),
]:
    os.environ.setdefault(key, val)
