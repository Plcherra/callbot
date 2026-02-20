"""
Audio utilities for Twilio Media Streams.
Twilio uses base64-encoded mulaw 8kHz mono. Our pipeline uses 16kHz PCM.
"""
import base64
import audioop
from typing import Optional

import numpy as np
from scipy import signal

TWILIO_SAMPLE_RATE = 8000
WHISPER_SAMPLE_RATE = 16000


def mulaw_to_pcm(base64_mulaw: str) -> np.ndarray:
    """
    Decode base64 mulaw 8kHz to float32 PCM in range [-1, 1].
    Twilio sends inbound audio as base64 mulaw 8kHz mono.
    """
    raw = base64.b64decode(base64_mulaw)
    pcm_16, _ = audioop.ulaw2lin(raw, 2)  # 2 = 16-bit output
    arr = np.frombuffer(pcm_16, dtype=np.int16)
    return arr.astype(np.float32) / 32768.0


def pcm_to_mulaw(
    pcm: np.ndarray,
    sample_rate: int = WHISPER_SAMPLE_RATE,
    target_rate: int = TWILIO_SAMPLE_RATE,
) -> str:
    """
    Convert float32 PCM to base64 mulaw for Twilio.
    Resamples from sample_rate to target_rate (8kHz) if needed.
    """
    if pcm.dtype != np.float32:
        pcm = pcm.astype(np.float32)
    if sample_rate != target_rate:
        num_samples = int(len(pcm) * target_rate / sample_rate)
        pcm = signal.resample(pcm, num_samples).astype(np.float32)
    # Convert to int16
    pcm_int16 = (pcm * 32767).clip(-32768, 32767).astype(np.int16)
    raw = pcm_int16.tobytes()
    mulaw_bytes = audioop.lin2ulaw(raw, 2)  # 2 = 16-bit input
    return base64.b64encode(mulaw_bytes).decode("ascii")


def resample_pcm(
    pcm: np.ndarray, from_rate: int, to_rate: int
) -> np.ndarray:
    """
    Resample PCM from one sample rate to another.
    Returns float32 array.
    """
    if from_rate == to_rate:
        return pcm.astype(np.float32) if pcm.dtype != np.float32 else pcm
    num_samples = int(len(pcm) * to_rate / from_rate)
    return signal.resample(pcm, num_samples).astype(np.float32)
