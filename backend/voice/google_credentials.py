"""Lightweight Google Cloud credential checks for TTS. No network synth calls."""

from __future__ import annotations

import os
from pathlib import Path


def validate_google_tts_credentials() -> None:
    """
    Verify Google Cloud credentials are available for TTS.
    Raises ValueError with actionable message if not.
    No blocking network calls.
    """
    status, _ = _check_credentials()
    if status == "configured":
        return
    if status == "missing_credentials":
        raise ValueError(
            "Google TTS: No credentials found. "
            "Run `gcloud auth application-default login` or set "
            "GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json"
        )
    raise ValueError(
        "Google TTS: Credential check failed. "
        "Run `gcloud auth application-default login` or set "
        "GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json"
    )


def check_google_tts_credentials() -> tuple[str, str]:
    """
    Lightweight credential check for health reporting.
    Returns (status, detail) where status is:
    - "configured": credentials available
    - "missing_credentials": no credentials (env/file)
    - "auth_failed": credentials found but invalid/expired
    """
    return _check_credentials()


def _check_credentials() -> tuple[str, str]:
    from google.auth import default as auth_default
    from google.auth.exceptions import DefaultCredentialsError

    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if creds_path:
        path = Path(creds_path).expanduser().resolve()
        if not path.exists():
            return "missing_credentials", f"File not found: {path}"
        if not path.is_file():
            return "missing_credentials", f"Not a file: {path}"
        if not os.access(path, os.R_OK):
            return "auth_failed", f"File not readable: {path}"
    try:
        auth_default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        return "configured", "ok"
    except DefaultCredentialsError as e:
        if creds_path:
            return "auth_failed", str(e)
        return "missing_credentials", str(e)
    except Exception as e:
        return "auth_failed", str(e)
