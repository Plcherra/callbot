"""Billable character counting and speech duration estimates for TTS cost guardrails."""

from __future__ import annotations

import re
import unicodedata


def normalize_text_for_cache_key(text: str) -> str:
    """Unicode NFC + collapse whitespace for stable cache keys."""
    t = unicodedata.normalize("NFC", text or "")
    return " ".join(t.split())


def plain_text_billable_chars(text: str) -> int:
    """Plain synthesis: character count includes spaces and newlines."""
    return len(text or "")


_MARK_BLOCK = re.compile(r"<mark\b[^>]*>.*?</mark>", re.IGNORECASE | re.DOTALL)
_MARK_VOID = re.compile(r"<mark\b[^>]*/>", re.IGNORECASE)


def ssml_billable_counts(ssml: str) -> tuple[int, int]:
    """Return (raw_len, sanitized_len) where sanitized excludes <mark> tags per billing notes."""
    raw = ssml or ""
    stripped = _MARK_VOID.sub("", _MARK_BLOCK.sub("", raw))
    return len(raw), len(stripped)


def estimated_speech_minutes(char_count: int, chars_per_minute: float) -> float:
    """Rough duration for cost estimates; floor at 0.05 minutes."""
    cpm = chars_per_minute if chars_per_minute > 0 else 900.0
    return max(char_count / cpm, 0.05)
