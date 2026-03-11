# Deployment

How the server is provisioned, what runs where, and how deploy works.

## What Runs Where

| Service        | Port | Process     | Purpose                          |
|----------------|------|-------------|----------------------------------|
| Next.js        | 3000 | PM2 callbot | Dashboard, API (outbound, CDR, internal) |
| Python backend | 8000 | PM2 callbot-voice | Voice webhook, WebSocket, Deepgram/Grok/ElevenLabs |
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
3. `npm ci && npm run build`
4. Create venv and install: `python3 -m venv venv && ./venv/bin/pip install -r backend/requirements.txt`
5. `pm2 delete callbot callbot-voice`
6. `pm2 start ecosystem.config.cjs`
7. `pm2 save`

**Secrets required:** `SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USER`, `APP_PATH`

### 2. Manual deploy

```bash
cd /path/to/callbot
./deploy/scripts/deploy.sh
```

Or step by step:

```bash
npm ci && npm run build
pip3 install -r backend/requirements.txt
pm2 delete callbot callbot-voice 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
```

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

If incoming calls are not answered: run `./deploy/scripts/diagnose-call-flow.sh` on the VPS and see [CALL_FLOW_AUDIT.md](CALL_FLOW_AUDIT.md).
