"""Shared payload helpers for Telnyx webhooks. Ensures canonical call_control_id across voice and CDR."""

from __future__ import annotations

from typing import Any


def parse_telnyx_direction(raw: str | None) -> str:
    """
    Map Telnyx direction to internal direction.
    Telnyx uses 'incoming'/'outgoing'; we use 'inbound'/'outbound'.
    Also supports 'inbound'/'outbound' if present.
    """
    s = (raw or "").strip().lower()
    if not s:
        return "inbound"
    if s.startswith("incoming") or s.startswith("inbound"):
        return "inbound"
    return "outbound"


def extract_call_party_numbers(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Extract direction, our_did (business DID for receptionist match), caller_number (customer),
    and raw from/to from Telnyx payload. Single source of truth for voice and CDR webhooks.
    """
    from_num = (payload.get("from") or "").strip()
    to_num = (payload.get("to") or "").strip()
    raw_direction = (payload.get("direction") or "").strip()
    direction = parse_telnyx_direction(raw_direction)

    # Inbound: to = our business DID, from = caller. Outbound: from = our DID, to = callee.
    our_did = to_num if direction == "inbound" else from_num
    caller_number = from_num if direction == "inbound" else to_num

    return {
        "direction": direction,
        "our_did": our_did,
        "caller_number": caller_number,
        "from_number": from_num,
        "to_number": to_num,
        "raw_direction": raw_direction,
    }


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
