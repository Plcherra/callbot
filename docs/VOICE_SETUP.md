# Self-Hosted Voice AI Setup

This document describes how to deploy and configure the Twilio + self-hosted voice AI integration (Whisper, Ollama, Piper TTS).

## Overview

- **Phone numbers**: Twilio provisions and manages numbers
- **Call handling**: Twilio webhooks route incoming calls to the voice server via Media Streams (WebSocket)
- **AI pipeline**: Whisper (STT) → Ollama (LLM) → Piper (TTS) on your server
- **Prompts**: Built from Supabase data and fetched via the Next.js API

## Prerequisites

- Twilio account
- Python 3.10+ with venv
- Ollama running locally with a model (e.g. `llama3.1:8b`)
- Piper voice model (`en_US-lessac-medium.onnx` in project root)
- Next.js app deployed (for webhooks and prompt API)

## Environment Variables

### Next.js (.env.local)

```env
USE_TWILIO_VOICE=true
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WEBHOOK_BASE_URL=https://your-app.com
VOICE_SERVER_WS_URL=wss://voice.your-domain.com/ws
VOICE_SERVER_API_KEY=optional_secret_for_prompt_api
```

### Voice Server (Python)

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
PROMPT_API_BASE_URL=https://your-app.com
VOICE_SERVER_API_KEY=optional_same_as_above
WHISPER_MODEL=tiny.en
LLM_MODEL=llama3.1:8b
WS_HOST=0.0.0.0
WS_PORT=8765
```

## Local Development

### 1. Run Next.js

```bash
npm run dev
```

### 2. Run voice server

```bash
cd /path/to/project
source venv/bin/activate
pip install -r voice-ai/requirements.txt
python voice-ai/call_server.py
```

### 3. Expose with ngrok

Twilio needs a public URL for webhooks and WebSocket. Use ngrok:

```bash
ngrok http 3000          # For Next.js webhooks
ngrok http 8765          # For voice server WebSocket (separate tunnel)
```

Set `TWILIO_WEBHOOK_BASE_URL` to the Next.js ngrok URL and `VOICE_SERVER_WS_URL` to `wss://<ngrok-id>.ngrok-free.app` for the voice tunnel.

### 4. Provision a number

With `USE_TWILIO_VOICE=true`, create a receptionist from the app. It will provision a Twilio number and configure the voice webhook.

## Deployment

### Voice server (systemd)

Create `/etc/systemd/system/voice-ai.service`:

```ini
[Unit]
Description=Voice AI Call Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/project
Environment="PATH=/path/to/project/venv/bin"
EnvironmentFile=/path/to/project/.env.voice
ExecStart=/path/to/project/venv/bin/python voice-ai/call_server.py
Restart=always

[Install]
WantedBy=multi-user.target
```

### Reverse proxy (nginx)

For WebSocket support:

```nginx
location /ws {
    proxy_pass http://127.0.0.1:8765;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;
}
```

### Caddy

```caddy
voice.your-domain.com {
    reverse_proxy localhost:8765
}
```

## Audio Format

| Direction | Twilio | Voice server |
|-----------|--------|--------------|
| Inbound   | base64 mulaw 8kHz | Decode → PCM → resample to 16kHz → Whisper |
| Outbound  | base64 mulaw 8kHz | Piper (22kHz) → resample to 8kHz → mulaw → base64 |

## Troubleshooting

- **No audio**: Check Piper model path and Ollama is running
- **High latency**: Use `tiny.en` Whisper, run voice server in same region as Twilio
- **Prompt not loading**: Verify `PROMPT_API_BASE_URL` and `VOICE_SERVER_API_KEY` match
- **Call usage not recorded**: Ensure `TWILIO_WEBHOOK_BASE_URL` is set and status callback is reachable
