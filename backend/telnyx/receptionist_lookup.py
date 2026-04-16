"""Shared receptionist lookup by DID. Used by voice and CDR webhooks."""

from __future__ import annotations

import logging
from typing import Any

from utils.phone import phones_match, to_canonical_digits

logger = logging.getLogger(__name__)

# Field names for matched_via logging (exactly which receptionist column matched)
MATCHED_VIA_TELNYX = "telnyx_phone_number"
MATCHED_VIA_INBOUND = "inbound_phone_number"
MATCHED_VIA_PHONE = "phone_number"


def get_receptionist_by_did(supabase, our_did: str, direction: str = "inbound") -> dict[str, Any] | None:
    """
    Look up active receptionist by DID.
    Checks telnyx_phone_number, inbound_phone_number, phone_number using canonical digit normalization.
    Those columns are a compatibility mirror of business_phone_numbers; keep them in sync via
    communication.ensure.mirror_business_phone_to_receptionists.
    Returns None if no match.
    Logs matched_via=telnyx_phone_number|inbound_phone_number|phone_number when a match is found.
    """
    raw_did = (our_did or "").strip()
    canonical_did = to_canonical_digits(raw_did)

    logger.info(
        "[CALL_DIAG] receptionist lookup raw_did=%r canonical_did=%r direction=%s",
        raw_did, canonical_did, direction,
    )
    if not canonical_did:
        logger.warning("[CALL_DIAG] receptionist lookup: empty DID, cannot match")
        return None

    res = supabase.table("receptionists").select(
        "id, name, user_id, phone_number, telnyx_phone_number, inbound_phone_number"
    ).eq("status", "active").execute()

    for r in res.data or []:
        rec_id = r.get("id", "")
        for field in (MATCHED_VIA_TELNYX, MATCHED_VIA_INBOUND, MATCHED_VIA_PHONE):
            stored = r.get(field)
            if not stored:
                continue
            if phones_match(raw_did, stored):
                logger.info(
                    "[CALL_DIAG] receptionist matched id=%s matched_via=%s (stored=%r canonical=%s)",
                    rec_id, field, stored, to_canonical_digits(stored),
                )
                return r

    logger.warning(
        "[CALL_DIAG] receptionist lookup: no match for DID canonical=%s (checked %s receptionists)",
        canonical_did, len(res.data or []),
    )
    return None


def get_receptionist_by_did_or_match(
    supabase, from_num: str, to_num: str, direction: str
) -> tuple[dict[str, Any] | None, str, str]:
    """
    Look up receptionist using direction-based our_did first, then try the other number if no match.
    Returns (receptionist, our_did, caller_number). Defensive against payload/direction quirks.
    """
    our_did = (to_num or "").strip() if direction == "inbound" else (from_num or "").strip()
    caller_number = (from_num or "").strip() if direction == "inbound" else (to_num or "").strip()

    receptionist = get_receptionist_by_did(supabase, our_did, direction)
    if receptionist:
        return receptionist, our_did, caller_number

    # Fallback: try the other number (from/to swapped semantics in some events)
    other_did = ((to_num or "").strip() if direction == "outbound" else (from_num or "").strip())
    if other_did and other_did != our_did:
        receptionist = get_receptionist_by_did(supabase, other_did, direction)
        if receptionist:
            logger.info(
                "[CALL_DIAG] receptionist matched via fallback other_did=%r (direction-based our_did=%r had no match)",
                other_did, our_did,
            )
            our_did = other_did
            caller_number = from_num if our_did == to_num else to_num
            return receptionist, our_did, caller_number

    return None, our_did, caller_number
