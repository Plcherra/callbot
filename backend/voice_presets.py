"""Curated voice presets for receptionist creation and settings.
   Mobile uses preset keys only; voice_id is resolved server-side.
   Deployers can customize VOICE_PRESETS with real ElevenLabs voice IDs per preset.
"""

from __future__ import annotations

from typing import Any

from config import settings

# Default ElevenLabs voice ID (env ELEVENLABS_VOICE_ID). Use distinct IDs per preset when available.
_DEFAULT_VOICE_ID = (settings.elevenlabs_voice_id or "CwhRBWXzGAHq8TQ4Fs17").strip() or "CwhRBWXzGAHq8TQ4Fs17"
_DEFAULT_MODEL = "eleven_flash_v2_5"

# Curated presets for AI receptionist use. voice_id can be customized per preset for variety.
VOICE_PRESETS: list[dict[str, Any]] = [
    {
        "key": "friendly_warm",
        "label": "Friendly & Warm",
        "description": "Warm and approachable — great for salons, wellness, and small businesses.",
        "gender_or_style_label": "Warm, approachable",
        "voice_id": _DEFAULT_VOICE_ID,
        "model_id": _DEFAULT_MODEL,
        "sample_text": "Hello! Thanks for calling. How can I help you today?",
    },
    {
        "key": "professional_calm",
        "label": "Professional & Calm",
        "description": "Clear and composed — ideal for offices, consulting, and professional services.",
        "gender_or_style_label": "Professional, calm",
        "voice_id": _DEFAULT_VOICE_ID,
        "model_id": _DEFAULT_MODEL,
        "sample_text": "Good day. Thank you for calling. How may I assist you?",
    },
    {
        "key": "premium_concierge",
        "label": "Premium Concierge",
        "description": "Polished and attentive — suits hospitality, high-end services, and concierge.",
        "gender_or_style_label": "Polished, attentive",
        "voice_id": _DEFAULT_VOICE_ID,
        "model_id": _DEFAULT_MODEL,
        "sample_text": "Welcome. I'd be happy to help you. What can I do for you today?",
    },
    {
        "key": "energetic_upbeat",
        "label": "Energetic & Upbeat",
        "description": "Lively and positive — good for fitness, events, and youth-oriented brands.",
        "gender_or_style_label": "Energetic, upbeat",
        "voice_id": _DEFAULT_VOICE_ID,
        "model_id": _DEFAULT_MODEL,
        "sample_text": "Hey! Thanks for calling — what can I do for you?",
    },
    {
        "key": "confident_clear",
        "label": "Confident & Clear",
        "description": "Assured and easy to understand — works for legal, medical, or any clarity-focused use.",
        "gender_or_style_label": "Confident, clear",
        "voice_id": _DEFAULT_VOICE_ID,
        "model_id": _DEFAULT_MODEL,
        "sample_text": "Thank you for calling. How may I help you today?",
    },
]

PRESET_KEYS = {p["key"] for p in VOICE_PRESETS}
DEFAULT_PRESET_KEY = "friendly_warm"


def get_preset(key: str) -> dict[str, Any] | None:
    """Return preset by key, or None."""
    for p in VOICE_PRESETS:
        if p["key"] == key:
            return p
    return None


def resolve_voice_id(voice_preset_key: str | None, fallback_voice_id: str | None) -> str | None:
    """Resolve voice_preset_key to ElevenLabs voice_id. If key is missing/invalid, use fallback_voice_id (e.g. from DB)."""
    if voice_preset_key:
        preset = get_preset(voice_preset_key)
        if preset:
            return (preset.get("voice_id") or "").strip() or None
    return (fallback_voice_id or "").strip() or None


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
