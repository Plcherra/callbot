"""Per-call mutable state for the voice pipeline (plain dicts; keys match Supabase/tool payloads).

offered_slots_state:
  exact_slots, suggested_slots, summary_periods, last_date_text

voice_session:
  booking_completed, sms (dict from create_appointment), etc.
"""


def new_offered_slots_state() -> dict:
    return {}


def new_voice_session() -> dict:
    return {}
