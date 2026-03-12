# Deployment

How the server is provisioned, what runs where, and how deploy works.

## What Runs Where

| Service        | Port | Process     | Purpose                          |
|----------------|------|-------------|----------------------------------|
| Next.js        | 3000 | PM2 callbot | Landing page, API (Stripe, cron, mobile, Google OAuth) |
| Python backend | 8000 | PM2 callbot-voice | Voice webhook, CDR, outbound, WebSocket, Deepgram/Grok/ElevenLabs |
| Nginx          | 80, 443 | systemd  | Reverse proxy, SSL termination   |

## Server Provisioning (Hetzner VPS)

- Ubuntu/Debian
- Nginx, Node.js, Python 3, `python3-venv` (`sudo apt install python3-venv`), PM2
- Domain: echodesk.us → VPS IP

## Deploy Methods

### 1. Git push (GitHub Actions)

On push to `main`, `.github/workflows/deploy.yml`:

1. SSH to VPS
2. `cd $APP_PATH`, git pull
3. Run `./deploy/scripts/deploy.sh` which:
   - `npm ci`
   - Create venv, `./venv/bin/pip install -r backend/requirements.txt`
   - `npm run validate:env`, `./venv/bin/python scripts/validate-env.py`
   - `npm run build`
   - `pm2 delete callbot callbot-voice`; `pm2 start ecosystem.config.cjs`
   - `./deploy/scripts/validate-infra-before-start.sh`

**Secrets required:** `SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USER`, `APP_PATH`

### 2. Manual deploy

```bash
cd /path/to/callbot
./deploy/scripts/deploy.sh
```

See [DEPLOY_CHECKLIST.md](DEPLOY_CHECKLIST.md) for pre-deploy checks.

### 3. Nginx setup (one-time)

```bash
sudo cp deploy/nginx/callbot.conf.template /etc/nginx/sites-available/callbot
sudo ln -sf /etc/nginx/sites-available/callbot /etc/nginx/sites-enabled/
# Ensure SSL cert exists first (see renew-cert.sh)
sudo nginx -t && sudo systemctl reload nginx
```

## SSL Certificate

- Let's Encrypt via certbot
- Renew: `./deploy/scripts/renew-cert.sh` or `certbot renew --nginx`
- Crontab for auto-renew: `0 3 * * * /path/to/deploy/scripts/renew-cert.sh`

## Env Loading

- `.env` and `.env.local` in project root
- PM2 ecosystem loads them via dotenv before starting apps
- Both Next.js and Python backend read from project root

## Call flow diagnostics

If incoming calls are not answered: run `./deploy/scripts/diagnose-call-flow.sh` on the VPS and see [CALL_FLOW_DIAGNOSTIC.md](CALL_FLOW_DIAGNOSTIC.md).
