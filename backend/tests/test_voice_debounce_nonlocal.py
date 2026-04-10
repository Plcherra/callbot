"""Regression for voice pipeline debounce transcript handoff (Python closure semantics)."""

from __future__ import annotations

import asyncio

import pytest


@pytest.mark.asyncio
async def test_debounce_done_writes_outer_turn_transcript_regression():
    """
    Mirrors `voice.pipeline` debounce `_on_debounce_done`: assignments to `turn_complete_transcript`
    must use `nonlocal` on the outer binding. Without it, `process_user_input` sees an empty string
    and logs `dispatch_skipped ... empty_transcript` (caller silence).
    """
    turn_complete_transcript = ""
    turn_complete_confidence = None
    snap_text, snap_conf = "Nine Am.", 0.91

    def _on_debounce_done(t: asyncio.Task) -> None:
        nonlocal turn_complete_transcript, turn_complete_confidence
        if t.cancelled():
            return
        turn_complete_transcript = snap_text
        turn_complete_confidence = snap_conf

    task = asyncio.create_task(asyncio.sleep(0))
    task.add_done_callback(_on_debounce_done)
    await task
    assert turn_complete_transcript == "Nine Am."
    assert turn_complete_confidence == 0.91
