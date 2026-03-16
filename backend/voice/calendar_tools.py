"""Calendar tool definitions for Grok function calling."""

import httpx

CALENDAR_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "check_availability",
            "description": "Check available time slots in the calendar for a given date. Use when the caller wants to book an appointment and needs to know what times are free.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date_text": {
                        "type": "string",
                        "description": "Natural language date/time like 'tomorrow at 4', 'March 17th at 7pm', 'next Friday morning'. Preferred when caller speaks naturally.",
                    },
                    "start_date": {
                        "type": "string",
                        "description": "ISO date (YYYY-MM-DD) or ISO datetime. Use if already normalized; otherwise pass date_text.",
                    },
                    "end_date": {"type": "string", "description": "Optional end date if checking a date range"},
                    "duration_minutes": {"type": "string", "description": "Appointment duration in minutes (default 30)"},
                    "timezone": {"type": "string", "description": "Timezone e.g. America/New_York (default America/New_York)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_appointment",
            "description": "Create a new appointment/booking in the calendar. Use after the caller has chosen a time slot.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date_text": {"type": "string", "description": "Natural language date/time for the appointment start (e.g. 'tomorrow at 4')."},
                    "start_time": {"type": "string", "description": "ISO datetime for appointment start"},
                    "duration_minutes": {"type": "string", "description": "Duration in minutes (default 30)"},
                    "summary": {"type": "string", "description": "Appointment title/summary (e.g. client name and service)"},
                    "description": {"type": "string", "description": "Optional additional details"},
                    "attendees": {"type": "array", "description": "Optional array of attendee email addresses", "items": {"type": "string"}},
                },
                "required": ["summary"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reschedule_appointment",
            "description": "Reschedule an existing appointment to a new time. Use when the caller wants to change an existing booking.",
            "parameters": {
                "type": "object",
                "properties": {
                    "event_id": {"type": "string", "description": "The calendar event ID to reschedule"},
                    "date_text": {"type": "string", "description": "Natural language new date/time (e.g. 'next Tuesday at 11')."},
                    "new_start": {"type": "string", "description": "New ISO datetime for the appointment"},
                    "duration_minutes": {"type": "string", "description": "Duration in minutes (default 30)"},
                },
                "required": ["event_id"],
            },
        },
    },
]


async def call_calendar_tool(
    base_url: str,
    api_key: str,
    receptionist_id: str,
    action: str,
    args: dict,
) -> str:
    """Execute calendar tool via voice calendar API."""
    url = f"{base_url.rstrip('/')}/api/voice/calendar"
    normalized: dict = {}
    for k, v in args.items():
        if v is None:
            continue
        if k == "duration_minutes" and isinstance(v, str):
            try:
                normalized[k] = int(v) or 30
            except (ValueError, TypeError):
                normalized[k] = 30
        elif k == "attendees" and isinstance(v, list):
            normalized[k] = [x for x in v if isinstance(x, str)]
        else:
            normalized[k] = v

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                url,
                headers={
                    "Content-Type": "application/json",
                    "x-voice-server-key": api_key,
                    "x-voice-api-key": api_key,
                },
                json={
                    "receptionist_id": receptionist_id,
                    "action": action,
                    "params": normalized,
                },
            )
            return resp.text
    except Exception as e:
        import json
        return json.dumps({"success": False, "error": str(e)})
