"""Telnyx WhatsApp: signup session (best-effort), signup status poll, phone number list sync."""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx

from config import settings

logger = logging.getLogger(__name__)

TELNYX_API = "https://api.telnyx.com/v2"


def _api_key() -> str:
    key = (settings.telnyx_api_key or "").strip()
    if not key:
        raise ValueError("TELNYX_API_KEY must be set")
    return key


def _parse_error(raw: str, ctx: str) -> str:
    if not raw or not raw.strip():
        return f"Telnyx {ctx} failed."
    try:
        import json

        data = json.loads(raw)
        errors = data.get("errors", [])
        if errors and isinstance(errors[0], dict):
            d = errors[0].get("detail") or errors[0].get("title")
            if d:
                return str(d)
    except Exception:
        pass
    return (raw or "")[:300]


def _unwrap_data(resp_json: dict[str, Any]) -> dict[str, Any]:
    d = resp_json.get("data")
    if isinstance(d, dict):
        return d
    if isinstance(d, list) and d and isinstance(d[0], dict):
        return d[0]
    return {}


def try_create_signup_session(*, phone_number_id: str | None, e164: str | None) -> dict[str, Any] | None:
    """
    Best-effort POST to create an embedded signup session. Telnyx documents portal-first flows;
    when this endpoint exists it may return signup id + oauth URL.
    """
    bodies: list[dict[str, Any]] = []
    if phone_number_id:
        bodies.append({"phone_number_id": phone_number_id})
        bodies.append({"phoneNumberId": phone_number_id})
    if e164:
        bodies.append({"phone_number": e164})
        bodies.append({"phoneNumber": e164})

    headers = {"Authorization": f"Bearer {_api_key()}", "Content-Type": "application/json"}
    paths = ("whatsapp/signup", "whatsapp/signup_sessions", "whatsapp/embedded_signups")

    with httpx.Client(timeout=45.0) as client:
        for path in paths:
            for body in bodies:
                if not body:
                    continue
                url = f"{TELNYX_API}/{path}"
                try:
                    r = client.post(url, json=body, headers=headers)
                    if r.status_code == 404:
                        continue
                    if r.is_success:
                        data = _unwrap_data(r.json())
                        if data:
                            logger.info("[telnyx whatsapp] signup created via %s", path)
                            return data
                except Exception as ex:
                    logger.debug("[telnyx whatsapp] POST %s failed: %s", path, ex)
    return None


def get_signup_status(signup_id: str) -> dict[str, Any] | None:
    sid = (signup_id or "").strip()
    if not sid:
        return None
    with httpx.Client(timeout=30.0) as client:
        r = client.get(
            f"{TELNYX_API}/whatsapp/signup/{sid}/status",
            headers={"Authorization": f"Bearer {_api_key()}"},
        )
        if not r.is_success:
            logger.warning("[telnyx whatsapp] signup status %s: %s", r.status_code, r.text[:200])
            return None
        return _unwrap_data(r.json())


def list_all_whatsapp_phone_numbers() -> list[dict[str, Any]]:
    """GET /whatsapp/phone_numbers (first page; increase page[size] if needed)."""
    out: list[dict[str, Any]] = []
    url = f"{TELNYX_API}/whatsapp/phone_numbers?page[size]=100"
    headers = {"Authorization": f"Bearer {_api_key()}"}
    with httpx.Client(timeout=45.0) as client:
        r = client.get(url, headers=headers)
        if not r.is_success:
            raise ValueError(_parse_error(r.text, "list whatsapp phone numbers"))
        j = r.json()
        rows = j.get("data") or []
        if isinstance(rows, list):
            for row in rows:
                if isinstance(row, dict):
                    out.append(row)
    return out


def _canonical_digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def find_whatsapp_row_for_e164(e164: str, rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    target = _canonical_digits(e164)
    if not target:
        return None
    for row in rows:
        pn = (
            row.get("phone_number")
            or row.get("display_phone_number")
            or (row.get("id") or "")
        )
        if _canonical_digits(str(pn)) == target:
            return row
    return None


def portal_handoff_url() -> str:
    base = (settings.telnyx_whatsapp_portal_url or "https://portal.telnyx.com").rstrip("/")
    if base.endswith("/messaging/whatsapp"):
        return base
    return f"{base}/messaging/whatsapp"
