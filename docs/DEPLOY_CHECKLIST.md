# Pre-Deploy Checklist

Use this before pushing to main or running a manual deploy. Ensures env and VPS are ready.

## Required Env Vars (VPS)

Verify in `.env` or `.env.local` on the VPS:

| Variable | Purpose |
|----------|---------|
| `TELNYX_API_KEY` | Telnyx API |
| `TELNYX_WEBHOOK_BASE_URL` | Public URL, e.g. `https://echodesk.us` (not localhost) |
| `DEEPGRAM_API_KEY` | Voice STT |
| `GROK_API_KEY` | Voice LLM |
| `ELEVENLABS_API_KEY` | Voice TTS |
| `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL` | Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase backend |

For mobile API (Stripe, OAuth): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `APP_URL`.

## VPS Checks

| Check | Command | Fix |
|-------|---------|-----|
| PM2 running | `pm2 list` | `pm2 start ecosystem.config.cjs` |
| Voice backend healthy | `curl -s http://127.0.0.1:8000/api/health` | Restart: `pm2 restart callbot-voice` |
| Nginx voice routes | `grep -A1 "location /api/telnyx/voice" /etc/nginx/sites-enabled/callbot` | `./deploy/scripts/sync-nginx-config.sh` |
| Tunnel → nginx | Check cloudflared config | Ingress must point at `http://127.0.0.1:80` |
| Landing exists | `ls landing/dist/index.html` | Static landing in `landing/dist` |

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
