"""Telnyx messaging webhook: message.sent, message.finalized for delivery tracking."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from supabase_client import create_service_role_client
from telnyx.sms_delivery_registry import is_us_toll_free_e164, record_delivery_status

logger = logging.getLogger(__name__)

# Status mapping: Telnyx to[].status -> our stored value
_FINAL_STATUS_MAP = {
    "delivered": "delivered",
    "delivery_failed": "delivery_failed",
    "sending_failed": "sending_failed",
    "delivery_unconfirmed": "delivery_unconfirmed",
    "sent": "sent",
    "queued": "sent",
    "sending": "sent",
}


def _extract_errors(payload: dict) -> object | None:
    to_list = payload.get("to") or []
    if to_list and isinstance(to_list[0], dict):
        err = to_list[0].get("errors")
        if err is not None:
            return err
    return payload.get("errors")


def _extract_status_detail(payload: dict) -> str | None:
    to_list = payload.get("to") or []
    if to_list and isinstance(to_list[0], dict):
        for k in ("status", "carrier", "line_type"):
            v = to_list[0].get(k)
            if v and isinstance(v, str):
                return v[:500]
    return None


def handle_sms_webhook(raw_body: bytes) -> dict:
    """
    Handle Telnyx messaging webhook (message.sent, message.finalized).
    Updates sms_messages.status when message.finalized received.
    Returns dict for JSON response.
    """
    try:
        body = json.loads(raw_body.decode("utf-8"))
    except Exception as e:
        logger.warning("[SMS_WEBHOOK] invalid JSON: %s", e)
        return {"received": True}

    data = body.get("data") or {}
    event_type = data.get("event_type")
    payload = data.get("payload") or data

    if event_type not in ("message.sent", "message.finalized"):
        return {"received": True}

    msg_id = payload.get("id")
    if not msg_id:
        logger.warning("[SMS_WEBHOOK] no message id in payload")
        return {"received": True}

    from_num = (payload.get("from") or {}).get("phone_number") or payload.get("from") or ""
    if isinstance(from_num, dict):
        from_num = from_num.get("phone_number") or ""
    from_str = str(from_num).strip() if from_num else ""

    if event_type == "message.finalized":
        to_list = payload.get("to") or []
        status = "sent"
        if to_list and isinstance(to_list[0], dict):
            raw_status = (to_list[0].get("status") or "").strip().lower()
            status = _FINAL_STATUS_MAP.get(raw_status, raw_status or "sent")

        record_delivery_status(str(msg_id), status)

        err_blob = _extract_errors(payload)
        detail = _extract_status_detail(payload)

        now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        update_row: dict = {"status": status, "updated_at": now_iso}
        if detail:
            update_row["provider_status_detail"] = detail
        if err_blob is not None:
            update_row["provider_errors"] = err_blob

        try:
            supabase = create_service_role_client()
            try:
                res = (
                    supabase.table("sms_messages")
                    .update(update_row)
                    .eq("telnyx_message_id", msg_id)
                    .execute()
                )
            except Exception as ex:
                logger.debug("[SMS_WEBHOOK] full row update failed (missing migration?): %s", ex)
                res = (
                    supabase.table("sms_messages")
                    .update({"status": status, "updated_at": now_iso})
                    .eq("telnyx_message_id", msg_id)
                    .execute()
                )
            if res and getattr(res, "data", None) and len(res.data) > 0:
                logger.info("[SMS_WEBHOOK] message.finalized msg_id=%s status=%s", msg_id[:36], status)
                if status == "delivery_failed":
                    tf = is_us_toll_free_e164(from_str)
                    logger.warning(
                        "[SMS_WEBHOOK] delivery_failed msg_id=%s from_toll_free=%s "
                        "(if toll-free, verify number in Telnyx portal; unverified TF often blocked downstream)",
                        msg_id[:36],
                        tf,
                    )
                    if tf:
                        logger.warning(
                            "[SMS_WEBHOOK] delivery_failed_unverified_toll_free_suspected msg_id=%s — "
                            "external: complete Toll-Free verification in Telnyx; not fixable in app code alone.",
                            msg_id[:36],
                        )
            else:
                logger.debug("[SMS_WEBHOOK] message.finalized msg_id=%s no matching row (sent before tracking)", msg_id[:36])
        except Exception as e:
            logger.warning("[SMS_WEBHOOK] update failed msg_id=%s: %s", msg_id[:36], e)

    return {"received": True}


def store_sms_sent(
    *,
    supabase,
    telnyx_message_id: str,
    appointment_id: str | None,
    to_number: str | None,
) -> None:
    """Store a sent SMS for delivery tracking. Call after successful send_sms."""
    if not telnyx_message_id:
        return
    try:
        supabase.table("sms_messages").insert({
            "telnyx_message_id": telnyx_message_id,
            "appointment_id": appointment_id,
            "to_number": to_number,
            "status": "sent",
        }).execute()
    except Exception as e:
        logger.warning("[SMS_TRACK] insert failed msg_id=%s: %s", telnyx_message_id[:36], e)
