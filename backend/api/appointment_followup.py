"""Post-booking follow-up: send confirmation SMS for an appointment."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

from telnyx import sms as telnyx_sms

logger = logging.getLogger(__name__)

_SMS_OPTOUT_SUFFIX = "Reply STOP to opt out."
_E164_RE = re.compile(r"^\+\d{10,15}$")


def _is_e164(s: str | None) -> bool:
    return bool(s and _E164_RE.match((s or "").strip()))


def _resolve_sms_from(supabase, receptionist_id: str) -> str | None:
    if not supabase or not receptionist_id:
        return None
    try:
        res = (
            supabase.table("receptionists")
            .select("telnyx_phone_number, inbound_phone_number")
            .eq("id", receptionist_id)
            .limit(1)
            .execute()
        )
        if res and getattr(res, "data", None) and res.data:
            row = res.data[0] or {}
            num = (row.get("telnyx_phone_number") or "").strip()
            if num:
                return num
            num = (row.get("inbound_phone_number") or "").strip()
            return num or None
        return None
    except Exception as e:
        logger.warning("[followup] resolve_sms_from failed: %s", e)
        return None


def send_appointment_confirmation(
    supabase,
    appointment: dict[str, Any],
    message: str | None = None,
) -> dict[str, Any]:
    """
    Send confirmation SMS for an appointment.
    Builds message from appointment data if message not provided.
    Returns {success: bool, error?: str}.
    """
    to_number = (appointment.get("caller_number") or "").strip()
    if not to_number or not _is_e164(to_number):
        return {"success": False, "error": "No valid caller number"}

    receptionist_id = appointment.get("receptionist_id")
    if not receptionist_id:
        return {"success": False, "error": "Missing receptionist"}

    from_number = _resolve_sms_from(supabase, receptionist_id)
    if not from_number:
        return {"success": False, "error": "No SMS number configured for receptionist"}

    if message is None or (isinstance(message, str) and not message.strip()):
        parts = []
        base = (appointment.get("followup_message_resolved") or "").strip()
        if base:
            parts.append(base)
        payment = (appointment.get("payment_link") or "").strip()
        if payment:
            parts.append(f"Payment: {payment}")
        instructions = (appointment.get("meeting_instructions") or "").strip()
        if instructions:
            parts.append(instructions)
        location = (appointment.get("customer_address") or appointment.get("location_text") or "").strip()
        if location:
            parts.append(f"Location: {location}")
        message = "\n\n".join(parts) if parts else "Your appointment is confirmed."

    text = f"{message.strip()}\n\n{_SMS_OPTOUT_SUFFIX}"

    sms_res = telnyx_sms.send_sms(to_number=to_number, from_number=from_number, text=text)
    if not sms_res.get("success"):
        return {
            "success": False,
            "error": sms_res.get("error") or "SMS send failed",
        }

    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    updates = {
        "confirmation_message_sent_at": now_iso,
        "updated_at": now_iso,
    }
    if (appointment.get("payment_link") or "").strip():
        updates["payment_link_sent_at"] = now_iso

    try:
        supabase.table("appointments").update(updates).eq("id", appointment["id"]).execute()
    except Exception as e:
        logger.warning("[followup] update timestamps failed: %s", e)

    return {"success": True}
