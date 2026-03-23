"""Sanitize LLM output before TTS: remove emojis, emoticons, stage directions, and narration."""

from __future__ import annotations

import re


# Unicode emoji ranges (common blocks)
_EMOJI_PATTERN = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F680-\U0001F6FF"  # transport & map
    "\U0001F1E0-\U0001F1FF"  # flags
    "\U00002702-\U000027B0"
    "\U000024C2-\U0001F251"
    "\U0001f926-\U0001f937"
    "\U00010000-\U0010ffff"
    "\u2600-\u26FF"
    "\u2700-\u27BF"
    "]+",
    flags=re.UNICODE,
)

# Emoticons: whole-token matches to avoid stripping letters from words
_EMOTICON_PATTERN = re.compile(
    r":\)|:-\)|:\(|:-\(|:D|:-D|:d|:-d|"
    r";\)|;-\)|;\(|;-\(|"
    r":P|:-P|:p|:-p|:O|:-O|:o|:-o|:/|:\\|</3|<3|"
    r":\*|;\*|=\)|=\("
)

# Bracketed/asterisked stage directions: (smiles), [laughs], *pause*
# Matches (...) [...] *...* when content is alphabetic + spaces only (max 40 chars)
_BRACKETED_DIRECTION_PATTERN = re.compile(
    r"(?:\(\s*[a-zA-Z][a-zA-Z\s]{0,39}\s*\)|\[\s*[a-zA-Z][a-zA-Z\s]{0,39}\s*\]|\*\s*[a-zA-Z][a-zA-Z\s]{0,39}\s*\*)",
)

# Standalone narration: "Smile." / "Smiles." as action (not "that makes me smile")
# Only remove when at start or after sentence boundary [.!?]
_NARRATION_START_PATTERN = re.compile(
    r"^(Smile|Smiles|Nod|Nods|Sigh|Sighs)\.\s*",
    re.IGNORECASE,
)
_NARRATION_AFTER_SENTENCE_PATTERN = re.compile(
    r"([.!?])\s+(Smile|Smiles|Nod|Nods|Sigh|Sighs)\.(?:\s|$)",
    re.IGNORECASE,
)


def sanitize_for_tts(text: str) -> str:
    """
    Remove non-spoken content before TTS: emojis, emoticons, stage directions, narration.

    Preserves real spoken content. Does not alter quotes, numbers, or natural speech.
    """
    if not text or not text.strip():
        return text

    t = text

    # 1. Remove emojis
    t = _EMOJI_PATTERN.sub("", t)

    # 2. Remove emoticons
    t = _EMOTICON_PATTERN.sub("", t)

    # 3. Remove bracketed/asterisked stage directions
    t = _BRACKETED_DIRECTION_PATTERN.sub("", t)

    # 4. Remove standalone narration words (Smile., Smiles., Nod., etc.)
    t = _NARRATION_START_PATTERN.sub("", t)
    t = _NARRATION_AFTER_SENTENCE_PATTERN.sub(r"\1 ", t)

    # Collapse multiple spaces and strip
    t = " ".join(t.split())

    return t.strip()
