"""
Echo Desk Voice AI - Local voice receptionist using Whisper, Ollama, and Piper TTS.
Run from project root: python voice-ai/echo_desk_voice.py
"""
import asyncio
import queue
import threading
import time
from pathlib import Path

import numpy as np
import ollama
import sounddevice as sd
import webrtcvad
from faster_whisper import WhisperModel
from piper.voice import PiperVoice

# Config
WHISPER_MODEL = "tiny.en"  # or "tiny" for multilingual
VAD_AGGRESSIVENESS = 3  # 0-3, higher = more aggressive silence detection
SAMPLE_RATE = 16000
FRAME_DURATION_MS = 30  # webrtcvad needs 10, 20, or 30 ms frames
SILENCE_TIMEOUT = 0.9  # seconds of silence to consider end of speech (lower = less lag)
LLM_MODEL = "llama3.1:8b"

# Prevent mic from picking up speaker (echo) — ignore audio while AI is talking
is_speaking = False

# Conversation history for natural back-and-forth
conversation_history: list[dict[str, str]] = []

# Paths (voice model in project root)
PROJECT_ROOT = Path(__file__).parent.parent
VOICE_PATH = PROJECT_ROOT / "en_US-lessac-medium.onnx"

# Piper TTS voice
piper_voice = PiperVoice.load(str(VOICE_PATH))

# Faster Whisper model (loads once)
whisper_model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")

# VAD
vad = webrtcvad.Vad(VAD_AGGRESSIVENESS)

# Queues for audio and text
audio_queue = queue.Queue()
text_queue = queue.Queue()

# Prompt for the receptionist
RECEPTIONIST_PROMPT = """
You are Echo Desk, an AI receptionist for small businesses like house cleaners, barbershops, contractors, and salons.
Be warm, professional, efficient, and friendly.
You can:
- Book appointments
- Reschedule or cancel
- Answer questions about services, prices, availability
- Confirm details
- Say goodbye politely

Keep responses short (2-4 sentences max) to sound natural on phone.
Use simple language.
If unsure, ask for clarification.
Never promise things you can't do.
Current business info: [insert user-provided details later, e.g. "House cleaning service in Boston, $150 for 2 hours, Mon-Sat 8am-6pm"]
"""


def audio_callback(indata, frames, time_info, status):
    """Callback for sounddevice stream — puts raw audio into queue."""
    if status:
        print(status)
    audio_queue.put(indata.copy())


def transcribe_audio():
    """Thread: takes audio chunks, runs VAD, transcribes when speech ends."""
    global is_speaking
    buffer = b""
    last_speech_time = time.time()
    while True:
        try:
            chunk = audio_queue.get(timeout=0.1)
            # Ignore mic input while AI is speaking (prevents echo feedback)
            if is_speaking:
                buffer = b""
                while not audio_queue.empty():
                    try:
                        audio_queue.get_nowait()
                    except queue.Empty:
                        break
                continue
            # InputStream uses dtype='int16', so chunk is already int16 PCM
            chunk_bytes = chunk.astype(np.int16).tobytes()

            # VAD check
            is_speech = vad.is_speech(chunk_bytes, SAMPLE_RATE)

            if is_speech:
                buffer += chunk_bytes
                last_speech_time = time.time()
            else:
                if buffer and (time.time() - last_speech_time > SILENCE_TIMEOUT):
                    # End of speech → transcribe
                    audio_float = np.frombuffer(buffer, dtype=np.int16).astype(np.float32) / 32768.0
                    segments, _ = whisper_model.transcribe(audio_float, language="en", beam_size=1)
                    text = " ".join([s.text for s in segments]).strip()
                    if text:
                        print(f"User: {text}")
                        text_queue.put(text)
                    buffer = b""
        except queue.Empty:
            if is_speaking:
                buffer = b""
            elif buffer and (time.time() - last_speech_time > SILENCE_TIMEOUT * 2):
                # Timeout buffer
                audio_float = np.frombuffer(buffer, dtype=np.int16).astype(np.float32) / 32768.0
                segments, _ = whisper_model.transcribe(audio_float, language="en", beam_size=1)
                text = " ".join([s.text for s in segments]).strip()
                if text:
                    print(f"User: {text}")
                    text_queue.put(text)
                buffer = b""


def llm_response(text):
    """Get reply from Llama with conversation history for natural dialogue."""
    global conversation_history
    # Build messages: system + history + new user turn
    messages = [{"role": "system", "content": RECEPTIONIST_PROMPT.strip()}]
    for msg in conversation_history:
        messages.append(msg)
    messages.append({"role": "user", "content": text})

    response = ollama.chat(model=LLM_MODEL, messages=messages)
    reply = response["message"]["content"].strip()
    print(f"AI: {reply}")

    # Keep last 6 turns (3 exchanges) to avoid context overflow
    conversation_history.append({"role": "user", "content": text})
    conversation_history.append({"role": "assistant", "content": reply})
    if len(conversation_history) > 6:
        conversation_history = conversation_history[-6:]

    return reply


def speak(text):
    """TTS with Piper. Mutes mic listening during playback to prevent echo."""
    global is_speaking
    is_speaking = True
    try:
        chunks = list(piper_voice.synthesize(text))
        if not chunks:
            return
        # Piper returns AudioChunk iterable; concatenate float arrays
        audio = np.concatenate([c.audio_float_array for c in chunks])
        sample_rate = chunks[0].sample_rate
        sd.play(audio, samplerate=sample_rate)
        sd.wait()
    finally:
        # Brief extra mute so mic doesn't catch tail of playback
        time.sleep(0.3)
        is_speaking = False


async def main_loop():
    # Start mic stream
    stream = sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="int16",
        blocksize=int(SAMPLE_RATE * FRAME_DURATION_MS / 1000),
        callback=audio_callback,
    )
    stream.start()

    # Start transcription thread
    trans_thread = threading.Thread(target=transcribe_audio, daemon=True)
    trans_thread.start()

    print("Echo Desk listening... Speak now.")

    while True:
        try:
            user_text = text_queue.get(timeout=0.5)
            if user_text.lower() in ["exit", "quit", "bye"]:
                print("Goodbye!")
                conversation_history.clear()
                break

            reply = llm_response(user_text)
            speak(reply)

        except queue.Empty:
            await asyncio.sleep(0.1)

    stream.stop()
    stream.close()


if __name__ == "__main__":
    asyncio.run(main_loop())
