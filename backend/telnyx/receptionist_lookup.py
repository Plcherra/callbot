"""Shared receptionist lookup by DID. Used by voice and CDR webhooks."""

from __future__ import annotations

import logging
from typing import Any

from utils.phone import phones_match, to_canonical_digits

logger = logging.getLogger(__name__)


def get_receptionist_by_did(supabase, our_did: str, direction: str = "inbound") -> dict[str, Any] | None:
    """
    Look up active receptionist by DID.
    Checks telnyx_phone_number, inbound_phone_number, phone_number using canonical digit normalization.
    Returns None if no match.
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
        for field in ("telnyx_phone_number", "inbound_phone_number", "phone_number"):
            stored = r.get(field)
            if not stored:
                continue
            if phones_match(raw_did, stored):
                stored_canonical = to_canonical_digits(stored)
                logger.info(
                    "[CALL_DIAG] receptionist matched id=%s via %s (stored=%r canonical=%s)",
                    rec_id, field, stored, stored_canonical,
                )
                return r

    logger.warning(
        "[CALL_DIAG] receptionist lookup: no match for DID canonical=%s (checked %s receptionists)",
        canonical_did, len(res.data or []),
    )
    return None
