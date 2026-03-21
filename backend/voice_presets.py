"""Curated voice presets for receptionist creation and settings.
   Mobile uses preset keys only; voice_id is resolved server-side.
   Deployers can customize VOICE_PRESETS with real ElevenLabs voice IDs per preset.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from config import settings

# NOTE: Preset keys are stable identifiers (API + DB). Labels/descriptions may evolve over time.
DEFAULT_PRESET_KEY = "friendly_warm"

# Single shared neutral preview sentence. Voice presets must affect audio only, not content.
PREVIEW_SAMPLE_TEXT = "Hello, thanks for calling. How can I help you today?"

# ElevenLabs model used for both preview and runtime TTS unless overridden.
DEFAULT_MODEL_ID = "eleven_flash_v2_5"

# Fallback env voice id (used only when no preset key + no stored voice_id exists).
ENV_DEFAULT_VOICE_ID = (settings.elevenlabs_voice_id or "").strip() or None

# Curated presets for AI receptionist use. These are the source of truth for preset->voice mapping.
# google_* fields are used when TTS_PROVIDER=google (Neural2 / WaveNet class voices).
VOICE_PRESETS: list[dict[str, Any]] = [
    {
        "key": "friendly_warm",
        "label": "Friendly & Warm",
        "description": "Warm and approachable — great for salons, wellness, and small businesses.",
        "gender_or_style_label": "Warm, approachable",
        "voice_id": "S9NKLs1GeSTKzXd9D0Lf",  # Haley Maven – Social Media Bestie
        "model_id": DEFAULT_MODEL_ID,
        "google_voice_name": "en-US-Neural2-F",
        "google_language_code": "en-US",
        "sample_text": PREVIEW_SAMPLE_TEXT,
    },
    {
        "key": "professional_calm",
        "label": "Professional & Calm",
        "description": "Clear and composed — ideal for offices, consulting, and professional services.",
        "gender_or_style_label": "Professional, calm",
        "voice_id": "vZzlAds9NzvLsFSWp0qk",  # Maria Mysh
        "model_id": DEFAULT_MODEL_ID,
        "google_voice_name": "en-US-Neural2-C",
        "google_language_code": "en-US",
        "sample_text": PREVIEW_SAMPLE_TEXT,
    },
    {
        "key": "premium_concierge",
        "label": "Premium Concierge",
        "description": "Polished and attentive — suits hospitality, high-end services, and concierge.",
        "gender_or_style_label": "Polished, attentive",
        "voice_id": "g6xIsTj2HwM6VR4iXFCw",  # Jessica Anne Bogart – Chatty and Friendly
        "model_id": DEFAULT_MODEL_ID,
        "google_voice_name": "en-US-Neural2-J",
        "google_language_code": "en-US",
        "sample_text": PREVIEW_SAMPLE_TEXT,
    },
    {
        "key": "energetic_upbeat",
        "label": "Energetic & Upbeat",
        "description": "Lively and positive — good for fitness, events, and youth-oriented brands.",
        "gender_or_style_label": "Energetic, upbeat",
        "voice_id": "UgBBYS2sOqTuMpoF3BR0",  # Mark – Natural Conversations
        "model_id": DEFAULT_MODEL_ID,
        "google_voice_name": "en-US-Neural2-D",
        "google_language_code": "en-US",
        "sample_text": PREVIEW_SAMPLE_TEXT,
    },
    {
        "key": "confident_clear",
        "label": "Confident & Clear",
        "description": "Assured and easy to understand — works for legal, medical, or any clarity-focused use.",
        "gender_or_style_label": "Confident, clear",
        "voice_id": "jD4PjnscE4XmlzgsuqY0",  # Logan – Genuine, Steady, and Deep
        "model_id": DEFAULT_MODEL_ID,
        "google_voice_name": "en-US-Neural2-A",
        "google_language_code": "en-US",
        "sample_text": PREVIEW_SAMPLE_TEXT,
    },
]

PRESET_KEYS = {p["key"] for p in VOICE_PRESETS}


def infer_preset_key_from_voice_id(voice_id: str | None) -> str | None:
    """Best-effort inference for legacy records: map known preset voice_id back to preset key."""
    vid = (voice_id or "").strip()
    if not vid:
        return None
    for p in VOICE_PRESETS:
        if (p.get("voice_id") or "").strip() == vid:
            return p["key"]
    return None


def get_preset(key: str) -> dict[str, Any] | None:
    """Return preset by key, or None."""
    for p in VOICE_PRESETS:
        if p["key"] == key:
            return p
    return None


@dataclass(frozen=True)
class ResolvedTtsVoice:
    """Resolved voices for ElevenLabs and Google from preset + legacy storage."""

    elevenlabs_voice_id: str | None
    google_language_code: str
    google_voice_name: str
    model_id: str | None


def resolve_voice_id(voice_preset_key: str | None, fallback_voice_id: str | None) -> str | None:
    """Resolve preset key to ElevenLabs voice_id with explicit fallback rules.

    Rules:
    - valid preset key -> preset voice_id
    - missing preset key + existing voice_id -> keep existing voice_id (backward compatibility)
    - invalid preset key -> default preset voice_id (avoid unexpected silent failures)
    - if nothing else exists -> env default voice id (if configured)
    """
    key = (voice_preset_key or "").strip() or None
    fb = (fallback_voice_id or "").strip() or None

    if key:
        preset = get_preset(key)
        if preset:
            return (preset.get("voice_id") or "").strip() or None
        default_preset = get_preset(DEFAULT_PRESET_KEY)
        return (default_preset.get("voice_id") if default_preset else None) or ENV_DEFAULT_VOICE_ID

    # No preset key supplied: keep stored voice_id if present
    return fb or ENV_DEFAULT_VOICE_ID


def resolve_tts_voice(voice_preset_key: str | None, fallback_voice_id: str | None) -> ResolvedTtsVoice:
    """Resolve ElevenLabs voice_id and Google voice name/language for the active provider."""
    el_id = resolve_voice_id(voice_preset_key, fallback_voice_id)
    key = (voice_preset_key or "").strip() or None
    fb = (fallback_voice_id or "").strip() or None

    preset: dict[str, Any] | None = None
    if key:
        preset = get_preset(key) or get_preset(DEFAULT_PRESET_KEY)
    elif fb:
        inferred = infer_preset_key_from_voice_id(fb)
        if inferred:
            preset = get_preset(inferred)

    if preset:
        gname = (preset.get("google_voice_name") or "").strip() or (settings.google_tts_default_voice_name or "").strip()
        glang = (preset.get("google_language_code") or "").strip() or (settings.google_tts_default_language_code or "en-US").strip()
        model_id = (preset.get("model_id") or "").strip() or DEFAULT_MODEL_ID
    else:
        gname = (settings.google_tts_default_voice_name or "en-US-Neural2-F").strip()
        glang = (settings.google_tts_default_language_code or "en-US").strip()
        model_id = DEFAULT_MODEL_ID

    return ResolvedTtsVoice(
        elevenlabs_voice_id=el_id,
        google_language_code=glang,
        google_voice_name=gname,
        model_id=model_id,
    )


def google_voice_allowlist() -> frozenset[str]:
    """Allowed Google voice names: env list, or all preset + default + backup voices."""
    raw = (settings.google_tts_voice_allowlist or "").strip()
    if raw:
        return frozenset(x.strip() for x in raw.split(",") if x.strip())
    names: set[str] = set()
    for p in VOICE_PRESETS:
        gn = (p.get("google_voice_name") or "").strip()
        if gn:
            names.add(gn)
    names.add((settings.google_tts_default_voice_name or "").strip())
    names.add((settings.google_tts_backup_voice_name or "").strip())
    return frozenset(n for n in names if n)


def list_presets_for_api() -> list[dict[str, Any]]:
    """Return presets for mobile API: no voice_id (internal only). Include preview_path for playback."""
    out = []
    for p in VOICE_PRESETS:
        out.append({
            "key": p["key"],
            "label": p["label"],
            "description": p["description"],
            "gender_or_style_label": p.get("gender_or_style_label"),
            "sample_text": p.get("sample_text"),
            "preview_path": f"/api/mobile/voice-presets/{p['key']}/preview",
        })
    return out
