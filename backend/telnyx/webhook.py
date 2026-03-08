"""Telnyx webhook signature validation."""

from __future__ import annotations

import base64
import hmac
import hashlib
import time
from typing import Any


def validate_telnyx_webhook(
    payload: bytes | str,
    signature: str | None,
    *,
    webhook_secret: str | None = None,
) -> bool:
    """
    Validate Telnyx webhook signature.
    Supports HMAC-SHA256 with TELNYX_WEBHOOK_SECRET.
    Header format: t=timestamp,h=base64signature
    Message: timestamp + '.' + raw_body
    """
    if not webhook_secret or not signature or not signature.strip():
        return False

    body = payload if isinstance(payload, bytes) else payload.encode("utf-8")
    secret = webhook_secret.encode("utf-8")

    try:
        parts = signature.strip().split(",")
        t_val = h_val = None
        for p in parts:
            p = p.strip()
            if p.startswith("t="):
                t_val = p[2:]
            elif p.startswith("h="):
                h_val = p[2:]

        if not t_val or not h_val:
            return False

        # Timestamp check (±60s)
        ts = int(t_val)
        if abs(time.time() - ts) > 60:
            return False

        message = t_val.encode() + b"." + body
        expected = hmac.new(secret, message, hashlib.sha256).digest()
        sig_bytes = base64.b64decode(h_val)

        return hmac.compare_digest(sig_bytes, expected)
    except Exception:
        return False
