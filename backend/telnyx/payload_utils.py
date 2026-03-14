"""Shared payload helpers for Telnyx webhooks. Ensures canonical call_control_id across voice and CDR."""

from __future__ import annotations

from typing import Any


def extract_call_control_id(data: dict[str, Any], payload: dict[str, Any]) -> str | None:
    """
    Extract canonical call identifier from Telnyx event.
    Use this in BOTH voice_webhook and cdr_webhook so insert and finalize use the same id.
    Telnyx may send call_control_id, call_leg_id, or call_session_id depending on event type.
    """
    return (
        (payload.get("call_control_id") or "").strip()
        or (payload.get("call_leg_id") or "").strip()
        or (payload.get("call_session_id") or "").strip()
        or (data.get("call_control_id") or "").strip()
        or None
    )
