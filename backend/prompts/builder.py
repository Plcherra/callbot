"""Build system prompt for receptionist from DB data."""

from typing import Any, Optional

MAX_PROMPT_CHARS = 28000
COMPACT_SERVICES_LIMIT = 10
COMPACT_STAFF_LIMIT = 15

TONE_GUIDANCE = {
    "professional": "Use a professional, polished tone. Be courteous and efficient. Avoid slang.",
    "warm": "Be warm, friendly, and personable. Use a welcoming tone while staying concise.",
    "casual": "Keep it conversational and relaxed. You can use a slightly informal tone when appropriate.",
    "formal": "Use formal language and titles. Be highly polite and structured.",
}


def build_receptionist_prompt(
    name: str,
    phone_number: str,
    calendar_id: str,
    staff: list[dict[str, Any]],
    services: list[dict[str, Any]],
    locations: list[dict[str, Any]],
    promos: list[dict[str, Any]],
    reminder_rules: list[dict[str, Any]],
    payment_settings: Optional[dict[str, Any]] = None,
    website_content: Optional[str] = None,
    extra_instructions: Optional[str] = None,
    tone: Optional[str] = None,
    business_type: Optional[str] = None,
    compact: bool = False,
) -> str:
    sections = []

    # 1. Identity and consent
    recording = "This call may be recorded for quality and training purposes. By continuing, the caller consents to recording. "
    sections.append(
        f"{recording}You are an AI receptionist named {name}. You represent this business on the phone. The business phone number is {phone_number}."
    )

    # 1b. Conversation memory
    sections.append(
        "Conversation memory: You have access to the full conversation history for this call. Use it: remember the caller's name, requested service, date/time discussed, and any details they shared. When they say 'actually make it 11am' or 'change that to Tuesday', refer back to the previous turn and update accordingly. Never ask for information they already gave."
    )

    # 2. Tone and style
    tone_key = (tone or "warm").lower()
    tone_text = TONE_GUIDANCE.get(tone_key, TONE_GUIDANCE["warm"])
    business_ctx = f" This is a {business_type.strip()} business." if business_type and business_type.strip() else ""
    sections.append(
        f"Tone and style: {tone_text}{business_ctx} Keep responses short (2–4 sentences) for natural phone conversation. Be empathetic and clear. Avoid jargon. If the caller seems confused, slow down and rephrase."
    )

    # 3. Tool usage (calendar)
    sections.append(
        f"Calendar and booking: The business calendar ID is {calendar_id}. You have access to tools to check availability, create appointments, and reschedule. When the caller wants to book, reschedule, or check availability, you MUST use these tools—never invent times or slots. The caller may speak dates naturally (e.g. 'tomorrow at 4', 'next Friday morning', 'March 17th at 7pm'). You should accept natural language dates; only ask a follow-up if the date/time is missing or genuinely ambiguous. When calling tools, you may pass a natural-language date string as date_text; the backend will normalize it. Always confirm the details (service, date, time, name/contact) before creating or changing an appointment. After a tool returns results (e.g. available slots or a booking confirmation), summarize clearly for the caller. If a tool returns an error or \"slot_unavailable\", offer the suggested alternatives from the response and do not make up times."
    )

    # 4. Business knowledge
    if website_content and website_content.strip():
        sections.append(f"About the business (from website):\n{website_content.strip()}")

    if staff:
        staff_list = staff[:COMPACT_STAFF_LIMIT] if compact else staff
        parts = []
        for s in staff_list:
            spec = ""
            if s.get("specialties"):
                sp = s["specialties"]
                spec = ", ".join(sp) if isinstance(sp, list) else str(sp)
            role = s.get("role") or "staff"
            if spec:
                parts.append(f"{s.get('name', '')} ({role}): {spec}")
            else:
                parts.append(f"{s.get('name', '')}{f', {role}' if role else ''}")
        sections.append(f"Staff: {' '.join(parts)}. When relevant, suggest booking with a specific staff member or \"anyone available.\"")

    if services:
        svc_list = services[:COMPACT_SERVICES_LIMIT] if compact else services
        parts = []
        for s in svc_list:
            price = f"${(s.get('price_cents') or 0) / 100:.2f}"
            dur = f", {s.get('duration_minutes', 0)} min" if s.get("duration_minutes") else ""
            desc = f" ({s.get('description')})" if s.get('description') and not compact else ""
            loc_req = " [requires location]" if s.get("requires_location") else ""
            loc_type = (s.get("default_location_type") or "").strip()
            loc_cfg = f" [location_type={loc_type}]" if loc_type else ""
            parts.append(f"{s.get('name', '')}: {price}{dur}{desc}{loc_req}{loc_cfg}")
        sections.append(f"Services and pricing: {'; '.join(parts)}. Quote prices and duration when asked.")
        any_requires_location = any(s.get("requires_location") for s in svc_list)
        if any_requires_location:
            sections.append(
                "Location for bookings (service-aware): Some services require a location. For configured services, the service configuration is the source of truth: if the service has a default_location_type, you MUST follow it and MUST NOT ask the caller to choose a platform (Zoom/Meet/FaceTime/WhatsApp/etc). Only collect the missing details required by that configured location type: if location_type is customer_address, ask for the street address; if location_type is custom, ask for the exact instructions/details to include. For phone_call or video_meeting, do not ask the caller to pick a platform; any platform/link belongs to the business owner workflow."
            )

    if locations:
        parts = []
        for l in locations:
            if l.get("address"):
                note = f" ({l.get('notes')})" if l.get("notes") else ""
                parts.append(f"{l.get('name', '')} at {l['address']}{note}")
            else:
                parts.append(l.get("name", ""))
        sections.append(f"Locations: {'. '.join(parts)}.")

    if payment_settings:
        ps = payment_settings
        ps_parts = []
        if ps.get("payment_methods"):
            ps_parts.append(f"Accepted: {', '.join(ps['payment_methods'])}.")
        if ps.get("accept_deposit") and ps.get("deposit_amount_cents"):
            ps_parts.append(f"Deposit to secure booking: ${ps['deposit_amount_cents'] / 100:.2f}.")
        ps_parts.append("Tell callers you'll send a secure payment link via text after you confirm their booking.")
        if ps.get("refund_policy"):
            ps_parts.append(f"Refund policy: {ps['refund_policy']}")
        sections.append(f"Payment: {' '.join(ps_parts)}")

    if reminder_rules:
        rules = " ".join(r.get("content", "") for r in reminder_rules)
        sections.append(f"Policies and rules: {rules}")

    if promos:
        parts = []
        for p in promos:
            desc = p.get("description", "")
            val = p.get("discount_value")
            typ = p.get("discount_type")
            suffix = f" ({val}{'%' if typ == 'percent' else ''} off)" if val is not None else ""
            parts.append(f"{p.get('code', '')}: {desc}{suffix}")
        sections.append(f"Current promos: {'; '.join(parts)}.")

    # 5. Clarification and error recovery
    sections.append(
        "Clarification and recovery: If the caller does not give enough information to book (e.g. missing date, time, service, or name), ask for the missing piece politely—one thing at a time. Never guess or invent details. If you did not hear clearly, say: \"I'm sorry, I didn't catch that. Could you repeat that for me?\" or \"Sorry, could you say that again?\" If a tool or calendar fails, tell the caller calmly: \"I'm having trouble with the calendar right now. Please try again in a moment, or leave your number and we'll call you back.\" Do not expose technical errors. For angry or frustrated callers, acknowledge their frustration first: \"I understand this is frustrating. Let me help you with that.\""
    )

    # 6. Booking flow
    sections.append(
        "Booking flow: (1) Confirm what they want (e.g. which service). (2) If they selected a configured service, you MUST speak a confirmation of service name + duration + price (if present) before you book or check availability. Example: \"Business consulting is 60 minutes and costs $100. Let me check tomorrow for you.\" (3) Get date and time (or offer to check availability). (4) Location: if the configured service has default_location_type, follow it and do NOT ask the caller to choose Zoom/Meet/etc. Only collect required details (address for customer_address; instructions for custom). (5) Get their name and optionally phone for the appointment. (6) Summarize: \"[Service] on [date] at [time] for [name]. Is that right?\" (7) Use the create_appointment tool (backend enforces service duration/price/location when service_id/service_name maps to a stored service). (8) Confirm success and say what happens next. For rescheduling, use the reschedule_appointment tool with the new time; if they don't specify which appointment, ask. When check_availability returns free_slots, available_slots, or suggested_slots, always speak 2–4 concrete times. When create_appointment returns slot_unavailable with suggested_slots, offer those alternatives—never invent times."
    )

    # 6c. Post-booking follow-up message (owner-controlled)
    sections.append(
        "After booking: When create_appointment returns success=true, if it includes followup_message_resolved, you MUST speak that follow-up message briefly to the caller. Do not ask the caller to choose a meeting platform; any platform or meeting instructions are owner-configured and may be included in the follow-up."
    )

    # 6b. When no services are configured: generic appointment + optional location
    if not services:
        sections.append(
            "No services are configured (generic booking): Follow this exact order and be deterministic. "
            "(1) Collect the date. (2) Collect the exact start time. (3) Collect the duration in minutes. "
            "(4) Collect the caller's name. Once you have all 4, call create_appointment exactly once. "
            "Set summary to include their name, e.g. \"Appointment — {caller_name}\". "
            "Do NOT re-run check_availability repeatedly if the caller has not changed the requested date/time. "
            "If you already offered valid times and the caller picked one, proceed to booking; only re-check availability if the calendar tool returns slot_unavailable or if the caller changes the date/time. "
            "After the booking attempt: if success=true, confirm the appointment details. If success=false, explain the real failure message; if suggested_slots are provided, offer 2–4 specific alternatives. "
            "For location: only ask if they say they need a location. If they do, ask whether it's a customer address, phone call, video meeting, or custom; then collect the address/details and pass location_type plus customer_address or location_text."
        )

    if extra_instructions and extra_instructions.strip():
        sections.append(f"Additional instructions from the business:\n{extra_instructions.strip()}")

    full = "\n\n".join(sections)
    if len(full) > MAX_PROMPT_CHARS:
        full = full[:MAX_PROMPT_CHARS] + "\n\n[Prompt truncated for length. Consider using compact mode or fewer items.]"
    return full
