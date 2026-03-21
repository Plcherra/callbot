"""Unit tests for Google TTS helpers, cache keys, and guardrails."""

from __future__ import annotations

import pytest

from voice.google_tts import assert_voice_allowed
from voice.tts_cache import MemoryLRUTtsCache, build_cache_key
from voice.tts_chars import (
    estimated_speech_minutes,
    normalize_text_for_cache_key,
    plain_text_billable_chars,
    ssml_billable_counts,
)
from voice.tts_facade import _truncate_text
from voice_presets import google_voice_allowlist


def test_normalize_text_for_cache_key_stable() -> None:
    assert normalize_text_for_cache_key("  hello   world  ") == "hello world"
    assert normalize_text_for_cache_key("café") == normalize_text_for_cache_key("café")


def test_cache_key_deterministic() -> None:
    a = build_cache_key(
        voice_name="en-US-Neural2-F",
        language_code="en-US",
        normalized_text="hello",
        speaking_rate=1.0,
        pitch=0.0,
        audio_encoding="MULAW",
        sample_rate_hertz=8000,
    )
    b = build_cache_key(
        voice_name="en-US-Neural2-F",
        language_code="en-US",
        normalized_text="hello",
        speaking_rate=1.0,
        pitch=0.0,
        audio_encoding="MULAW",
        sample_rate_hertz=8000,
    )
    assert a == b
    assert len(a) == 64


def test_plain_and_ssml_chars() -> None:
    assert plain_text_billable_chars("a b") == 3
    raw_len, san_len = ssml_billable_counts('<speak>Hi <mark name="m"/> there</speak>')
    assert raw_len > 0
    assert san_len < raw_len  # <mark> excluded from sanitized billable length


def test_estimated_minutes_floor() -> None:
    assert estimated_speech_minutes(1, 900) == 0.05
    assert estimated_speech_minutes(900, 900) == 1.0


def test_assert_voice_allowlist() -> None:
    allow = frozenset({"en-US-Neural2-F"})
    assert_voice_allowed("en-US-Neural2-F", allowlist=allow, allow_premium_tiers=False)
    with pytest.raises(ValueError):
        assert_voice_allowed("en-US-Studio-O", allowlist=frozenset({"en-US-Studio-O"}), allow_premium_tiers=False)
    assert_voice_allowed("en-US-Studio-O", allowlist=frozenset({"en-US-Studio-O"}), allow_premium_tiers=True)


def test_truncate_text() -> None:
    assert _truncate_text("x" * 10, 100) == "x" * 10
    t = _truncate_text("a" * 100, 10)
    assert len(t) == 10
    assert t.endswith("...")


@pytest.mark.asyncio
async def test_memory_cache_hit() -> None:
    c = MemoryLRUTtsCache(max_entries=10, ttl_seconds=3600)
    assert await c.get("k1") is None
    await c.put("k1", b"abc")
    assert await c.get("k1") == b"abc"


def test_google_voice_allowlist_non_empty() -> None:
    wl = google_voice_allowlist()
    assert len(wl) >= 1
