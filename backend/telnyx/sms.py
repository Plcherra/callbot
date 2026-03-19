"""Telnyx SMS sender (MVP, best-effort)."""

from __future__ import annotations

import logging

import httpx

from config import settings

logger = logging.getLogger(__name__)

TELNYX_API = "https://api.telnyx.com/v2"


def send_sms(*, to_number: str, from_number: str, text: str) -> dict:
    """
    Send one SMS via Telnyx.
    Returns:
      {success: bool, telnyx_message_id?: str, error?: str, status_code?: int}
    """
    api_key = (settings.telnyx_api_key or "").strip()
    to_number = (to_number or "").strip()
    from_number = (from_number or "").strip()
    text = (text or "").strip()

    if not api_key:
        return {"success": False, "error": "telnyx_api_key_missing"}
    if not to_number or not from_number or not text:
        return {"success": False, "error": "missing_to_from_or_text"}

    body = {"to": to_number, "from": from_number, "text": text}
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.post(
                f"{TELNYX_API}/messages",
                json=body,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
        if not r.is_success:
            err = (r.text or "").strip()
            return {
                "success": False,
                "status_code": r.status_code,
                "error": (err[:300] if err else "telnyx_send_failed"),
            }
        try:
            data = r.json() or {}
        except Exception:
            data = {}
        msg_id = ((data.get("data") or {}).get("id") or "").strip() or None
        return {"success": True, "telnyx_message_id": msg_id}
    except Exception as e:
        logger.exception("[TELNYX_SMS] send_sms_exception: %s", e)
        return {"success": False, "error": "telnyx_send_exception"}

