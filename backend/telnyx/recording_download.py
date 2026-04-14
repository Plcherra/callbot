"""Fetch fresh call recording download URLs from Telnyx (short-lived presigned links)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

TELNYX_API_V2 = "https://api.telnyx.com/v2"


def _mp3_from_recording_record(rec: dict[str, Any] | None) -> str | None:
    if not rec:
        return None
    du = rec.get("download_urls") or rec.get("recording_urls") or {}
    if not isinstance(du, dict):
        return None
    url = (du.get("mp3") or du.get("wav") or "").strip()
    return url or None


def _unwrap_data_item(raw: dict[str, Any] | None) -> dict[str, Any] | None:
    """Normalize Telnyx JSON:API or flat recording object."""
    if not raw:
        return None
    if "attributes" in raw and isinstance(raw["attributes"], dict):
        merged = dict(raw["attributes"])
        if raw.get("id"):
            merged.setdefault("id", raw["id"])
        return merged
    return raw


async def fetch_fresh_recording_mp3_url(
    *,
    api_key: str,
    telnyx_recording_id: str | None,
    call_control_id: str | None,
) -> str | None:
    """
    Return a fresh mp3 URL from Telnyx, or None if unavailable.
    Prefer telnyx_recording_id; fall back to list filter by call_control_id.
    """
    key = (api_key or "").strip()
    if not key:
        logger.warning("[recording] TELNYX_API_KEY missing; cannot refresh URL")
        return None

    headers = {"Authorization": f"Bearer {key}", "Accept": "application/json"}

    async with httpx.AsyncClient(timeout=25.0) as client:
        rid = (telnyx_recording_id or "").strip()
        if rid:
            try:
                resp = await client.get(
                    f"{TELNYX_API_V2}/recordings/{rid}",
                    headers=headers,
                )
                if resp.status_code == 200:
                    body = resp.json()
                    item = _unwrap_data_item(body.get("data") if isinstance(body.get("data"), dict) else None)
                    url = _mp3_from_recording_record(item)
                    if url:
                        return url
                else:
                    logger.warning(
                        "[recording] Telnyx GET recording id=%s status=%s body=%s",
                        rid[:8],
                        resp.status_code,
                        (resp.text or "")[:200],
                    )
            except Exception as e:
                logger.warning("[recording] Telnyx GET recording failed: %s", e)

        ccid = (call_control_id or "").strip()
        if not ccid:
            return None

        try:
            resp = await client.get(
                f"{TELNYX_API_V2}/recordings",
                headers=headers,
                params={
                    "filter[call_control_id]": ccid,
                    "page[size]": 1,
                },
            )
            if resp.status_code != 200:
                logger.warning(
                    "[recording] Telnyx list recordings call_control_id=%s status=%s",
                    ccid[:16],
                    resp.status_code,
                )
                return None
            body = resp.json()
            data = body.get("data")
            if not isinstance(data, list) or not data:
                return None
            first = _unwrap_data_item(data[0] if isinstance(data[0], dict) else None)
            return _mp3_from_recording_record(first)
        except Exception as e:
            logger.warning("[recording] Telnyx list recordings failed: %s", e)
            return None
