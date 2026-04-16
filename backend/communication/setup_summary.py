"""Build GET /communication/setup payload: status + server-derived onboarding guidance."""

from __future__ import annotations

from typing import Any, Literal

NextRecommendedAction = Literal[
    "activate_sms",
    "submit_sms",
    "connect_whatsapp",
    "continue_whatsapp",
    "retry_sms",
    "retry_whatsapp",
    "none",
]


def compute_next_recommended_action(sms_status: str, whatsapp_status: str) -> NextRecommendedAction:
    if sms_status == "failed":
        return "retry_sms"
    if whatsapp_status == "failed":
        return "retry_whatsapp"
    if sms_status == "not_started":
        return "activate_sms"
    if sms_status == "needs_submission":
        return "submit_sms"
    if whatsapp_status == "not_connected":
        return "connect_whatsapp"
    if whatsapp_status == "needs_connection":
        return "continue_whatsapp"
    return "none"


def _sms_guidance(status: str, failure_reason: str | None) -> dict[str, str | None]:
    fr = (failure_reason or "").strip() or None
    if status == "not_started":
        return {
            "sms_setup_title": "Activate SMS",
            "sms_setup_description": (
                "SMS uses a separate registration (10DLC) so you can text customers from your business number. "
                "Tap below to start."
            ),
            "sms_primary_action": "Activate SMS",
            "sms_help_text": "US carriers require brand and campaign registration; approval often takes 1–2 business days.",
        }
    if status == "needs_submission":
        return {
            "sms_setup_title": "Complete SMS setup",
            "sms_setup_description": (
                "Finish the information needed for carrier registration (business details, use case, sample messages). "
                "We’ll guide you; full Telnyx automation is coming soon."
            ),
            "sms_primary_action": "Mark ready to submit",
            "sms_help_text": (
                "When your details are ready, submit for review. You can still use voice on this number while SMS is pending."
            ),
        }
    if status == "pending_review":
        return {
            "sms_setup_title": "SMS review in progress",
            "sms_setup_description": (
                "Your registration is with the carrier or provider for review. This usually takes about 1–2 business days."
            ),
            "sms_primary_action": "",
            "sms_help_text": "We’ll update this status when approved. If something fails, you’ll see a fix step here.",
        }
    if status == "approved":
        return {
            "sms_setup_title": "SMS active",
            "sms_setup_description": "Your business line is registered for SMS where enabled.",
            "sms_primary_action": "",
            "sms_help_text": None,
        }
    if status == "failed":
        return {
            "sms_setup_title": "Fix SMS setup",
            "sms_setup_description": "Registration failed or needs changes. Review the message below and try again.",
            "sms_primary_action": "Retry SMS setup",
            "sms_help_text": fr,
        }
    return {
        "sms_setup_title": "SMS",
        "sms_setup_description": None,
        "sms_primary_action": "",
        "sms_help_text": None,
    }


def _wa_guidance(status: str, failure_reason: str | None) -> dict[str, str | None]:
    fr = (failure_reason or "").strip() or None
    if status == "not_connected":
        return {
            "whatsapp_setup_title": "Connect WhatsApp",
            "whatsapp_setup_description": (
                "WhatsApp must be linked to your business number through Meta and your messaging provider (e.g. Telnyx). "
                "Start here to begin setup."
            ),
            "whatsapp_primary_action": "Connect WhatsApp",
            "whatsapp_help_text": "Setup usually takes a few minutes once you have Meta Business access.",
        }
    if status == "needs_connection":
        return {
            "whatsapp_setup_title": "Continue WhatsApp setup",
            "whatsapp_setup_description": (
                "Complete linking your WhatsApp Business account and phone number. "
                "Embedded signup will open here when your provider is configured."
            ),
            "whatsapp_primary_action": "Continue setup",
            "whatsapp_help_text": (
                "You may need a Meta Business Manager account and admin access to finish connection."
            ),
        }
    if status == "pending":
        return {
            "whatsapp_setup_title": "WhatsApp setup in progress",
            "whatsapp_setup_description": (
                "We’re waiting on provider or Meta to finish activation. This is normal for a few minutes."
            ),
            "whatsapp_primary_action": "",
            "whatsapp_help_text": "If nothing changes for a long time, use support or retry when offered.",
        }
    if status == "active":
        return {
            "whatsapp_setup_title": "WhatsApp connected",
            "whatsapp_setup_description": "Messages can flow through your connected WhatsApp number when enabled.",
            "whatsapp_primary_action": "",
            "whatsapp_help_text": None,
        }
    if status == "failed":
        return {
            "whatsapp_setup_title": "Retry WhatsApp connection",
            "whatsapp_setup_description": "Connection failed. Review the details below and start the link process again.",
            "whatsapp_primary_action": "Retry connection",
            "whatsapp_help_text": fr,
        }
    return {
        "whatsapp_setup_title": "WhatsApp",
        "whatsapp_setup_description": None,
        "whatsapp_primary_action": "",
        "whatsapp_help_text": None,
    }


def build_setup_summary(
    business: dict[str, Any],
    phone: dict[str, Any] | None,
    sms: dict[str, Any] | None,
    wa: dict[str, Any] | None,
    *,
    is_default_business: bool,
    primary_receptionist_name: str | None = None,
) -> dict[str, Any]:
    phone = phone or {}
    sms = sms or {"status": "not_started", "failure_reason": None}
    wa = wa or {"status": "not_connected", "failure_reason": None}

    phone_status = (phone.get("status") or "provisioning").strip()
    e164 = (phone.get("phone_number_e164") or "").strip() or None

    voice_status = "active" if phone_status == "active" and e164 else phone_status

    sms_status = (sms.get("status") or "not_started").strip()
    wa_status = (wa.get("status") or "not_connected").strip()

    next_action = compute_next_recommended_action(sms_status, wa_status)
    sms_g = _sms_guidance(sms_status, sms.get("failure_reason"))
    wa_g = _wa_guidance(wa_status, wa.get("failure_reason"))

    return {
        "business_id": business.get("id"),
        "business_name": business.get("name"),
        "is_default_business": is_default_business,
        "mode": business.get("mode"),
        "primary_receptionist_name": primary_receptionist_name,
        "phone_number_e164": e164,
        "telnyx_number_id": phone.get("telnyx_number_id"),
        "voice_status": voice_status,
        "sms_status": sms_status,
        "sms_failure_reason": sms.get("failure_reason"),
        "whatsapp_status": wa_status,
        "whatsapp_failure_reason": wa.get("failure_reason"),
        "next_recommended_action": next_action,
        **sms_g,
        **wa_g,
    }
