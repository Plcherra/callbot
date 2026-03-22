"""Google Cloud Text-to-Speech synthesis (telephony μ-law 8 kHz and preview MP3)."""

from __future__ import annotations

import asyncio
import logging
import random
from dataclasses import dataclass

from google.api_core import exceptions as google_exceptions
from google.cloud import texttospeech_v1 as tts

logger = logging.getLogger(__name__)

_tts_client: tts.TextToSpeechClient | None = None


def get_tts_client() -> tts.TextToSpeechClient:
    """Process-wide client (thread-safe for sync calls via to_thread)."""
    global _tts_client
    if _tts_client is None:
        _tts_client = tts.TextToSpeechClient()
    return _tts_client


@dataclass(frozen=True)
class GoogleTtsSynthesizeOptions:
    """Options for a single Google TTS request."""

    language_code: str
    voice_name: str
    speaking_rate: float = 1.0
    pitch: float = 0.0
    audio_encoding: str = "MULAW"  # MULAW | MP3 | LINEAR16
    sample_rate_hertz: int = 8000
    ssml_gender: int | None = None  # tts.SsmlVoiceGender


def _voice_params(opts: GoogleTtsSynthesizeOptions) -> tts.VoiceSelectionParams:
    gender = opts.ssml_gender
    if gender is None:
        # SSML_VOICE_GENDER_UNSPECIFIED lets the API use the voice's default
        gender = tts.SsmlVoiceGender.SSML_VOICE_GENDER_UNSPECIFIED
    return tts.VoiceSelectionParams(
        language_code=opts.language_code,
        name=opts.voice_name,
        ssml_gender=gender,
    )


def _audio_config(opts: GoogleTtsSynthesizeOptions) -> tts.AudioConfig:
    enc = (opts.audio_encoding or "MULAW").upper()
    if enc == "MULAW":
        ae = tts.AudioEncoding.MULAW
    elif enc == "MP3":
        ae = tts.AudioEncoding.MP3
    elif enc == "LINEAR16":
        ae = tts.AudioEncoding.LINEAR16
    else:
        raise ValueError(f"Unsupported audio_encoding: {opts.audio_encoding}")
    return tts.AudioConfig(
        audio_encoding=ae,
        sample_rate_hertz=opts.sample_rate_hertz,
        speaking_rate=opts.speaking_rate,
        pitch=opts.pitch,
    )


def assert_voice_allowed(
    voice_name: str,
    *,
    allowlist: frozenset[str],
    allow_premium_tiers: bool,
) -> None:
    """Raise ValueError if voice is not allowlisted or violates tier policy."""
    vn = (voice_name or "").strip()
    if not vn:
        raise ValueError("empty Google TTS voice name")
    if allowlist and vn not in allowlist:
        raise ValueError(f"voice not in allowlist: {vn}")
    if not allow_premium_tiers:
        upper = vn.upper()
        if "STUDIO" in upper or "CHIRP" in upper:
            raise ValueError(f"premium-tier voice blocked (set GOOGLE_TTS_ALLOW_PREMIUM_TIERS): {vn}")


def _synthesize_blocking(
    client: tts.TextToSpeechClient,
    *,
    synthesis_input: tts.SynthesisInput,
    voice: tts.VoiceSelectionParams,
    audio_config: tts.AudioConfig,
) -> bytes:
    response = client.synthesize_speech(
        input=synthesis_input,
        voice=voice,
        audio_config=audio_config,
    )
    return response.audio_content


def synthesize_text_blocking(text: str, opts: GoogleTtsSynthesizeOptions) -> bytes:
    """Synchronous synthesis from plain text (blocking). Uses shared client."""
    client = get_tts_client()
    inp = tts.SynthesisInput(text=text or "")
    return _synthesize_blocking(
        client,
        synthesis_input=inp,
        voice=_voice_params(opts),
        audio_config=_audio_config(opts),
    )


def synthesize_ssml_blocking(ssml: str, opts: GoogleTtsSynthesizeOptions) -> bytes:
    """Synchronous synthesis from SSML (blocking)."""
    client = get_tts_client()
    inp = tts.SynthesisInput(ssml=ssml or "")
    return _synthesize_blocking(
        client,
        synthesis_input=inp,
        voice=_voice_params(opts),
        audio_config=_audio_config(opts),
    )


def _is_retryable(err: BaseException) -> bool:
    return isinstance(
        err,
        (
            google_exceptions.TooManyRequests,
            google_exceptions.ResourceExhausted,
            google_exceptions.ServiceUnavailable,
            google_exceptions.InternalServerError,
            google_exceptions.DeadlineExceeded,
        ),
    )


async def synthesize_text_with_retry(
    text: str,
    opts: GoogleTtsSynthesizeOptions,
    *,
    max_retries: int,
    base_seconds: float,
    max_seconds: float,
) -> bytes:
    """Run blocking synthesis in a thread with exponential backoff + jitter."""
    attempt = 0
    while True:
        try:
            return await asyncio.to_thread(synthesize_text_blocking, text, opts)
        except BaseException as err:
            attempt += 1
            if attempt > max_retries or not _is_retryable(err):
                raise
            cap = min(max_seconds, base_seconds * (2 ** (attempt - 1)))
            delay = random.uniform(0, cap)
            logger.warning(
                "[Google TTS] retryable error attempt=%s/%s: %s; sleeping %.2fs",
                attempt,
                max_retries,
                err,
                delay,
            )
            await asyncio.sleep(delay)


async def synthesize_ssml_with_retry(
    ssml: str,
    opts: GoogleTtsSynthesizeOptions,
    *,
    max_retries: int,
    base_seconds: float,
    max_seconds: float,
) -> bytes:
    attempt = 0
    while True:
        try:
            return await asyncio.to_thread(synthesize_ssml_blocking, ssml, opts)
        except BaseException as err:
            attempt += 1
            if attempt > max_retries or not _is_retryable(err):
                raise
            cap = min(max_seconds, base_seconds * (2 ** (attempt - 1)))
            delay = random.uniform(0, cap)
            logger.warning(
                "[Google TTS] SSML retryable error attempt=%s/%s: %s; sleeping %.2fs",
                attempt,
                max_retries,
                err,
                delay,
            )
            await asyncio.sleep(delay)
