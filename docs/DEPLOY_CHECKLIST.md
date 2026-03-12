# Pre-Deploy Checklist

Use this before pushing to main or running a manual deploy. Ensures env and VPS are ready.

## Required Env Vars (VPS)

Verify in `.env` or `.env.local` on the VPS:

| Variable | Purpose |
|----------|---------|
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Next.js Server Actions (required for build) |
| `TELNYX_API_KEY` | Telnyx API |
| `TELNYX_WEBHOOK_BASE_URL` | Public URL, e.g. `https://echodesk.us` (not localhost) |
| `DEEPGRAM_API_KEY` | Voice STT |
| `GROK_API_KEY` | Voice LLM |
| `ELEVENLABS_API_KEY` | Voice TTS |
| `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL` | Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase backend |

Generate Server Actions key: `openssl rand -base64 32`

## VPS Checks

| Check | Command | Fix |
|-------|---------|-----|
| PM2 running | `pm2 list` | `pm2 start ecosystem.config.cjs` |
| Voice backend healthy | `curl -s http://127.0.0.1:8000/health` | Restart: `pm2 restart callbot-voice` |
| Nginx voice routes | `grep -A1 "location /api/telnyx/voice" /etc/nginx/sites-enabled/callbot` | `./deploy/scripts/fix-nginx-voice.sh` |
| Tunnel → nginx | Check cloudflared config | Ingress must point at `http://127.0.0.1:80` |

## After Deploy

```bash
./deploy/scripts/diagnose-call-flow.sh
pm2 logs callbot-voice --lines 20
```

Place a test call and verify "Answered call" and "Stream started" in logs.

## Call Flow Recovery

If calls fail after deploy:

```bash
./deploy/scripts/restore-call-flow.sh
```

See [CALL_FLOW_DIAGNOSTIC.md](CALL_FLOW_DIAGNOSTIC.md) for full troubleshooting.
