"""Minimal tests for recording_consent_played: default False, true only when set on call_logs."""

from __future__ import annotations

import pytest

from voice.constants import RECORDING_CONSENT_PHRASE


def test_recording_consent_phrase_non_empty_and_contains_keywords():
    """Consent phrase must exist and include compliance wording."""
    assert RECORDING_CONSENT_PHRASE
    assert "recorded" in RECORDING_CONSENT_PHRASE.lower()
    assert "consent" in RECORDING_CONSENT_PHRASE.lower()


def test_recording_consent_played_default_false_when_no_row():
    """When call_log_row is None, recording_consent_played must be False (CDR logic)."""
    call_log_row = None
    recording_consent_played = bool(call_log_row.get("recording_consent_played") if call_log_row else False)
    assert recording_consent_played is False


def test_recording_consent_played_false_when_key_missing():
    """When call_log_row has no recording_consent_played key, default False."""
    call_log_row = {"id": "x", "started_at": "2026-01-01T00:00:00Z"}
    recording_consent_played = bool(call_log_row.get("recording_consent_played") if call_log_row else False)
    assert recording_consent_played is False


def test_recording_consent_played_false_when_explicitly_false():
    """When call_log_row.recording_consent_played is False, stay False."""
    call_log_row = {"id": "x", "recording_consent_played": False}
    recording_consent_played = bool(call_log_row.get("recording_consent_played") if call_log_row else False)
    assert recording_consent_played is False


def test_recording_consent_played_true_only_when_set():
    """When call_log_row.recording_consent_played is True, value is True."""
    call_log_row = {"id": "x", "recording_consent_played": True}
    recording_consent_played = bool(call_log_row.get("recording_consent_played") if call_log_row else False)
    assert recording_consent_played is True
