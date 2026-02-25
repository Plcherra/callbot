# Echo Desk Voice AI Server

Self-hosted voice AI for echodesk: Twilio Media Streams → Whisper (STT) → Ollama (LLM) → Piper (TTS). Runs on Hetzner (cpx31 or better) to eliminate per-minute voice costs.

**Level 2** features: per-call memory, Google Calendar tool calling (check availability, create, reschedule), STT confidence filtering, retries, and configurable timeouts.

**Production**: Use `call_server.py`. For a local mic/speaker demo without Twilio, use `echo_desk_voice.py` (local-only).

## Quick Start (Local)

```bash
# From project root
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r voice-ai/requirements.txt

# Ensure Ollama is running with a model (e.g. llama3.1:8b)
ollama pull llama3.1:8b

# Download Piper voice (first run)
# en_US-lessac-medium.onnx should be at project root

# Run
python voice-ai/call_server.py
```

Server listens on `WS_HOST:WS_PORT` (default `0.0.0.0:8765`).

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PROMPT_API_BASE_URL` | Yes (prod) | `http://localhost:3000` | Next.js app URL for fetching receptionist prompts |
| `VOICE_SERVER_API_KEY` | Yes (prod) | — | Secret for `x-voice-server-key` header when calling `/api/receptionist-prompt` |
| `WS_HOST` | No | `0.0.0.0` | Bind address |
| `WS_PORT` | No | `8765` | WebSocket port |
| `WHISPER_MODEL` | No | `tiny.en` | faster-whisper model (tiny.en, base.en, small.en for cpx31) |
| `LLM_MODEL` | No | `llama3.1:8b` | Ollama model name |
| `VAD_AGGRESSIVENESS` | No | `3` | WebRTC VAD sensitivity (0–3) |
| `SILENCE_TIMEOUT` | No | `0.9` | Seconds of silence before processing speech |
| `SILENCE_TIMEOUT_AFTER_PLAYBACK` | No | `0.4` | Shorter silence window after TTS so next turn is detected sooner |
| `CALENDAR_API_BASE_URL` | No | same as `PROMPT_API_BASE_URL` | Next.js base URL for `/api/voice/calendar` |
| `CALENDAR_API_TIMEOUT` | No | `15` | Timeout in seconds for calendar API calls |
| `MAX_TOOL_CALL_ROUNDS` | No | `2` | Max LLM rounds when using calendar tools |
| `STT_NO_SPEECH_PROB_THRESHOLD` | No | `0.6` | Reject utterance if Whisper no_speech_prob above this |
| `STT_MIN_AVG_LOGPROB` | No | `-1.0` | Reject utterance if segment avg_logprob below this |
| `RETRY_PROMPT_COUNT` | No | `2` | Retries for prompt fetch (with backoff) |
| `RETRY_LLM_COUNT` | No | `2` | Retries for Ollama chat on failure |
| `RETRY_CALENDAR_COUNT` | No | `1` | Retries for calendar API on 5xx/timeout |
| `SUPABASE_URL` | No | — | For future DB access |
| `SUPABASE_SERVICE_ROLE_KEY` | No | — | For future DB access |

## Hetzner Deployment Runbook

### 1. Create Server

- **Type**: cpx31 or higher (8 GB RAM recommended for Whisper + Ollama)
- **Image**: Ubuntu 24.04 LTS
- **Location**: Choose closest to your users

### 2. Install System Dependencies

```bash
apt update && apt upgrade -y
apt install -y python3 python3-pip python3-venv git
```

### 3. Install Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.1:8b
ollama serve  # or run via systemd (see below)
```

### 4. Deploy Voice Server

```bash
cd /opt
git clone <your-repo> echodesk
cd echodesk

python3 -m venv venv
source venv/bin/activate
pip install -r voice-ai/requirements.txt
```

### 5. Voice Model (Piper)

Ensure `en_US-lessac-medium.onnx` is at `/opt/echodesk/en_US-lessac-medium.onnx`. Download from [Piper voices](https://huggingface.co/rhasspy/piper-voices) if missing.

### 6. Environment File

Create `/opt/echodesk/voice-ai/.env` (or use systemd `Environment=`):

```bash
PROMPT_API_BASE_URL=https://echodesk.us
VOICE_SERVER_API_KEY=<generate-secure-secret>
WS_HOST=127.0.0.1
WS_PORT=8765
WHISPER_MODEL=tiny.en
LLM_MODEL=llama3.1:8b
```

**Important**: Set `WS_HOST=127.0.0.1` so the WebSocket is only reachable via reverse proxy. Do not expose 8765 directly to the internet.

### 7. Reverse Proxy (Caddy)

Install Caddy and create `/etc/caddy/Caddyfile`:

```
echodesk.us {
    # Next.js app (Vercel or your app server)
    reverse_proxy https://your-app.vercel.app {
        header_up Host your-app.vercel.app
    }
}

ws.echodesk.us {
    reverse_proxy 127.0.0.1:8765
}
```

Or if app and voice run on the same server:

```
echodesk.us {
    reverse_proxy 127.0.0.1:3000
    handle_path /ws* {
        reverse_proxy 127.0.0.1:8765
    }
}
```

Reload: `systemctl reload caddy`

### 8. systemd Service

Create `/etc/systemd/system/echodesk-voice.service`:

```ini
[Unit]
Description=Echodesk Voice AI Server
After=network.target ollama.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/echodesk
EnvironmentFile=/opt/echodesk/voice-ai/.env
ExecStart=/opt/echodesk/venv/bin/python voice-ai/call_server.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable echodesk-voice
systemctl start echodesk-voice
systemctl status echodesk-voice
```

### 9. Next.js / echodesk App Config

Set these in your Next.js `.env`:

```bash
TWILIO_VOICE_MODE=streams
VOICE_SERVER_WS_URL=wss://ws.echodesk.us
# or wss://echodesk.us/ws if using handle_path
VOICE_SERVER_API_KEY=<same-secret-as-voice-server>
TWILIO_WEBHOOK_BASE_URL=https://echodesk.us
```

### 10. Verify

1. Make a test call to a receptionist number.
2. Check logs: `journalctl -u echodesk-voice -f`
3. Twilio connects to `VOICE_SERVER_WS_URL`; voice server fetches prompt from `PROMPT_API_BASE_URL/api/receptionist-prompt?receptionist_id=...` with `x-voice-server-key`.

## Troubleshooting

- **Prompt fetch 401**: Ensure `VOICE_SERVER_API_KEY` matches in Next.js and voice server.
- **Prompt fetch timeout**: Ensure `PROMPT_API_BASE_URL` is reachable from the Hetzner server (no localhost).
- **Ollama connection refused**: Start Ollama before the voice server; check `ollama list`.
- **High latency**: Use `base.en` or `small.en` for Whisper; consider GPU for larger instances.
- **Out of memory**: Reduce `LLM_MODEL` to `llama3.2:3b` or similar.

## Model Recommendations (cpx31)

| Model | RAM | Latency | Quality |
|-------|-----|---------|---------|
| tiny.en | ~2 GB | Fast | Good for short responses |
| base.en | ~3 GB | Medium | Better accuracy |
| llama3.1:8b | ~6 GB | Medium | Good conversation |
| llama3.2:3b | ~2 GB | Faster | Lighter alternative |

**Level 2 upgrade:** For 85–90% booking success, use `llama3.1:70b` or `mixtral:8x22b` on a larger instance (32+ GB RAM). Set `LLM_MODEL=llama3.1:70b` in env.

## Performance Targets (cpx31)

Use these as acceptance criteria and for local validation (e.g. log timestamps at speech_end, llm_start, llm_end, tts_end).

| Metric | Target |
|--------|--------|
| **Latency (with one tool call)** | P95 from “user stops speaking” to “first TTS chunk sent” &lt; 3.5 s |
| **Latency (no tool)** | P95 &lt; 2.5 s |
| **Booking success rate** | Create/reschedule succeed ≥ 98% when Calendar and Ollama are healthy |
| **Error handling** | On Calendar/network errors, graceful message and no crash ≥ 99.5% |
| **Memory** | Process RSS stable under 2 GB with one concurrent call; no unbounded growth over 10 calls (memory cleaned per disconnect) |
| **Concurrency** | At least 2 concurrent calls on cpx31 without OOM or severe latency regression; document recommended max concurrent streams for your instance |

Optional: add logging like `logger.info("timing speech_end=%s llm_start=%s ...", ...)` to measure segments locally.

## Manual Test Plan (10 Scenarios)

Run these manually to validate Level 2 behaviour before release.

1. **Happy path booking**  
   Call → greet → say “I’d like to book a haircut tomorrow at 2pm” → AI checks calendar, creates event, confirms.  
   **Pass:** Event appears in Google Calendar with correct time and summary.

2. **Conflict handling**  
   Create an event manually in Google Calendar for a slot, then have the AI book the same slot.  
   **Pass:** AI reports that the slot is unavailable and suggests alternative times (from `suggested_slots`).

3. **Reschedule**  
   Say “I need to move my appointment to 3pm” (after having one booked or referring to a known event).  
   **Pass:** AI reschedules; event in Calendar shows new time.

4. **Low STT confidence**  
   Mumble or speak very quietly.  
   **Pass:** No or minimal LLM call; no hallucinated reply (optionally “I didn’t catch that” if implemented).

5. **Clarification**  
   Say only “I want an appointment” (no date/time).  
   **Pass:** AI asks for date and time, then completes booking once given.

6. **Services and pricing**  
   Ask “What do you offer and how much?”  
   **Pass:** Answer matches configured services and prices from the receptionist prompt.

7. **Staff**  
   Ask “Can I see Sarah?” (or a configured staff name).  
   **Pass:** AI acknowledges and can book with that staff (e.g. in event title/description if supported).

8. **Error recovery**  
   Simulate Calendar API down (e.g. wrong URL or invalid token) or 401.  
   **Pass:** AI says something like “I’m having trouble with the calendar right now, please call back or leave your number” and does not crash.

9. **Multi-turn memory**  
   Say “Book me for Tuesday at 10am” then “Actually make it 11am”.  
   **Pass:** AI uses context and updates the same booking to 11am.

10. **Barge-in (if implemented)**  
    Start a long AI response, then speak over it.  
    **Pass:** AI stops or defers and eventually responds to the new input. (If barge-in is not implemented, document “N/A – same as current behaviour”.)
