"""Deterministic slot selection against last offered slots only."""

from voice.slot_selection import is_new_availability_search_intent, resolve_slot_selection


def test_resolve_time_against_offered_slots():
    state = {
        "exact_slots": ["2026-03-28T15:00:00-04:00", "2026-03-28T14:00:00-04:00"],
        "suggested_slots": [],
        "last_date_text": "tomorrow",
    }
    r = resolve_slot_selection("three pm", state)
    assert r.ok
    assert "15:00:00" in (r.slot_iso or "")


def test_resolve_ordinal_second():
    state = {
        "exact_slots": [
            "2026-03-28T14:00:00-04:00",
            "2026-03-28T15:00:00-04:00",
        ],
        "suggested_slots": [],
    }
    r = resolve_slot_selection("the second one", state)
    assert r.ok
    assert "15:00:00" in (r.slot_iso or "")


def test_new_search_skips_slot_resolution():
    assert is_new_availability_search_intent("can you check availability for another day") is True
    state = {"exact_slots": ["2026-03-28T15:00:00-04:00"], "suggested_slots": []}
    # Still resolves if we call resolve without gating — caller gates with is_new_availability_search_intent
    r = resolve_slot_selection("check another day", state)
    assert not r.ok
