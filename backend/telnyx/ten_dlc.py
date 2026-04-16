"""Telnyx 10DLC: brand, campaign builder, phone-to-campaign linking."""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import quote

import httpx

from config import settings

logger = logging.getLogger(__name__)

TELNYX_API = "https://api.telnyx.com/v2"


def _api_key() -> str:
    key = (settings.telnyx_api_key or "").strip()
    if not key:
        raise ValueError("TELNYX_API_KEY must be set for 10DLC")
    return key


def _parse_error(raw: str, context: str) -> str:
    if not raw or not raw.strip():
        return f"Telnyx {context} failed."
    if raw.strip().startswith("<") or "<!doctype" in raw.lower():
        return "Telnyx returned HTML — check API key and endpoint."
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
    cleaned = re.sub(r"<[^>]*>", "", raw).strip()
    return cleaned[:300] + ("..." if len(cleaned) > 300 else "") or f"Telnyx {context} failed."


def _unwrap_data(resp_json: dict[str, Any]) -> dict[str, Any]:
    d = resp_json.get("data")
    return d if isinstance(d, dict) else {}


def create_brand(body: dict[str, Any]) -> dict[str, Any]:
    """POST /10dlc/brand — body uses camelCase per Telnyx API."""
    with httpx.Client(timeout=60.0) as client:
        r = client.post(
            f"{TELNYX_API}/10dlc/brand",
            json=body,
            headers={"Authorization": f"Bearer {_api_key()}", "Content-Type": "application/json"},
        )
        if not r.is_success:
            raise ValueError(_parse_error(r.text, "create brand"))
        return _unwrap_data(r.json())


def get_brand(brand_id: str) -> dict[str, Any]:
    with httpx.Client(timeout=30.0) as client:
        r = client.get(
            f"{TELNYX_API}/10dlc/brand/{brand_id}",
            headers={"Authorization": f"Bearer {_api_key()}"},
        )
        if not r.is_success:
            raise ValueError(_parse_error(r.text, "get brand"))
        return _unwrap_data(r.json())


def submit_campaign(body: dict[str, Any]) -> dict[str, Any]:
    """POST /10dlc/campaignBuilder"""
    with httpx.Client(timeout=60.0) as client:
        r = client.post(
            f"{TELNYX_API}/10dlc/campaignBuilder",
            json=body,
            headers={"Authorization": f"Bearer {_api_key()}", "Content-Type": "application/json"},
        )
        if not r.is_success:
            raise ValueError(_parse_error(r.text, "submit campaign"))
        return _unwrap_data(r.json())


def link_phone_number_to_campaign(e164: str, campaign_id: str) -> dict[str, Any]:
    """
    Link a US local number to a 10DLC campaign.
    Telnyx: PUT /10dlc/phone_number_campaigns/{phoneNumber}
    """
    enc = quote((e164 or "").strip(), safe="")
    payload = {"phoneNumber": (e164 or "").strip(), "campaignId": campaign_id}
    with httpx.Client(timeout=60.0) as client:
        r = client.put(
            f"{TELNYX_API}/10dlc/phone_number_campaigns/{enc}",
            json=payload,
            headers={"Authorization": f"Bearer {_api_key()}", "Content-Type": "application/json"},
        )
        if not r.is_success:
            # Some accounts use POST — try once
            r2 = client.post(
                f"{TELNYX_API}/10dlc/phone_number_campaigns",
                json=payload,
                headers={"Authorization": f"Bearer {_api_key()}", "Content-Type": "application/json"},
            )
            if not r2.is_success:
                raise ValueError(_parse_error(r.text, "link phone to campaign"))
            return _unwrap_data(r2.json())
        return _unwrap_data(r.json())


def set_phone_messaging_profile(phone_number_id: str, messaging_profile_id: str) -> None:
    """PATCH /phone_numbers/{id} to attach SMS messaging profile (required before 10DLC link)."""
    pid = (phone_number_id or "").strip()
    mp = (messaging_profile_id or "").strip()
    if not pid or not mp:
        return
    with httpx.Client(timeout=30.0) as client:
        r = client.patch(
            f"{TELNYX_API}/phone_numbers/{pid}",
            json={"messaging_profile_id": mp},
            headers={"Authorization": f"Bearer {_api_key()}", "Content-Type": "application/json"},
        )
        if not r.is_success:
            raise ValueError(_parse_error(r.text, "set messaging profile"))


def extract_id(record: dict[str, Any], *keys: str) -> str | None:
    for k in keys:
        v = record.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return None
