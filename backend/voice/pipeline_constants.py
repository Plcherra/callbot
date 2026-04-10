"""Shared constants for the voice pipeline (debounce, history, spoken prompts)."""

MAX_HISTORY = 20
DEBOUNCE_MS = 1200
DEBOUNCE_MS_FALLBACK = 800
SHORT_PAUSE_MAX_WORDS = 4
MIN_CONFIDENCE = 0.35

FAST_ACK_AVAILABILITY = "Checking now."
FAST_ACK_BOOKING = "Got it. Booking now."

# Voice output: assistant must output only literal spoken words (no narration/actions)
VOICE_OUTPUT_INSTRUCTIONS = (
    "\n\nVoice output rules: Your replies are spoken aloud. Output ONLY the literal words to be spoken. "
    "Never include emojis, emoticons (e.g. :)), stage directions, or action narration such as (smiles), [laughs], *pause*, or standalone words like 'Smile' or 'Smiles' used as action text. "
    "Keep content suitable for text-to-speech: no markup, no parenthetical asides that are not meant to be spoken."
)
