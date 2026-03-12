"""Telnyx phone number provisioning and configuration."""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx

from config import settings

logger = logging.getLogger(__name__)
TELNYX_API = "https://api.telnyx.com/v2"
FALLBACK_AREA_CODES = ["212", "310", "415", "508", "781", "646", "202", "305", "702"]


def _parse_error(raw: str, context: str) -> str:
    if not raw or not raw.strip():
        return f"Telnyx {context} failed. Please try again."
    if raw.strip().startswith("<") or "<!doctype" in raw.lower():
        return "Telnyx failed. Check your API key and Connection ID, then try again."
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
    return cleaned[:200] + "..." if len(cleaned) > 200 else cleaned or f"Telnyx {context} failed."


def _get_api_key() -> str:
    key = (settings.telnyx_api_key or "").strip()
    if not key:
        raise ValueError("TELNYX_API_KEY must be set")
    return key


def provision_number(area_code: str) -> tuple[str, str]:
    """
    Search for available local numbers and order one.
    Returns (phone_number_id, e164_phone_number).
    """
    api_key = _get_api_key()
    to_try = [area_code] + [ac for ac in FALLBACK_AREA_CODES if ac != area_code]

    for ac in to_try:
        try:
            result = _try_provision_in_area(ac, api_key)
            if result:
                return result
        except Exception as e:
            logger.warning("Provision failed for area %s: %s", ac, e)

    raise ValueError(
        f"No available phone numbers in area code {area_code} or common fallbacks. Try bringing your own number."
    )


def _try_provision_in_area(area_code: str, api_key: str) -> tuple[str, str] | None:
    with httpx.Client(timeout=30.0) as client:
        r = client.get(
            f"{TELNYX_API}/available_phone_numbers",
            params={
                "filter[country_code]": "US",
                "filter[phone_number_type]": "local",
                "filter[features][]": "voice",
                "filter[national_destination_code]": area_code,
                "page[size]": 1,
            },
            headers={"Authorization": f"Bearer {api_key}"},
        )
        if not r.is_success:
            raise ValueError(_parse_error(r.text, "search"))

        data = r.json()
        numbers = data.get("data") or []
        if not numbers:
            return None
        phone_number = numbers[0].get("phone_number")
        if not phone_number:
            return None

        order_body: dict[str, Any] = {"phone_numbers": [{"phone_number": phone_number}]}
        conn_id = (settings.telnyx_connection_id or "").strip()
        if conn_id:
            order_body["connection_id"] = conn_id

        r2 = client.post(
            f"{TELNYX_API}/number_orders",
            json=order_body,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
        if not r2.is_success:
            raise ValueError(_parse_error(r2.text, "order"))

        order_data = r2.json()
        ordered = (order_data.get("data") or {}).get("phone_numbers") or []
        if not ordered:
            return None
        first = ordered[0]
        num_id = first.get("id")
        num = first.get("phone_number")
        if not num_id or not num:
            return None
        return str(num_id), str(num)


def configure_voice_url(phone_number_id: str, webhook_url: str) -> None:
    """Configure the voice URL for a Telnyx number."""
    api_key = _get_api_key()
    conn_id = (settings.telnyx_connection_id or "").strip()
    body: dict[str, Any] = {"webhook_url": webhook_url}
    if conn_id:
        body["connection_id"] = conn_id

    with httpx.Client(timeout=15.0) as client:
        r = client.patch(
            f"{TELNYX_API}/phone_numbers/{phone_number_id}",
            json=body,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
        if not r.is_success:
            raise ValueError(_parse_error(r.text, "configure voice"))


def release_number(phone_number_id: str) -> None:
    """Release (delete) a Telnyx phone number."""
    api_key = _get_api_key()
    with httpx.Client(timeout=15.0) as client:
        r = client.delete(
            f"{TELNYX_API}/phone_numbers/{phone_number_id}",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        if not r.is_success and r.status_code != 404:
            raise ValueError(_parse_error(r.text, "release"))
