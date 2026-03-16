# Deployment

How the server is provisioned, what runs where, and how deploy works.

## What Runs Where

| Service        | Port | Process     | Purpose                          |
|----------------|------|-------------|----------------------------------|
| Python backend | 8000 | PM2 callbot-voice | Voice webhook, CDR, outbound, WebSocket, mobile API, Stripe, Google OAuth, cron |
| Static landing | -    | Nginx       | Served from `landing/dist`       |
| Nginx          | 80, 443 | systemd  | Reverse proxy, SSL termination   |

## Server Provisioning (Hetzner VPS)

- Ubuntu/Debian
- Nginx, Python 3, `python3-venv` (`sudo apt install python3-venv`), PM2
- Domain: echodesk.us → VPS IP

## Deploy Methods

### 1. Git push (GitHub Actions)

On push to `main`, `.github/workflows/deploy.yml`:

1. SSH to VPS
2. `cd $APP_PATH`, git pull
3. Run `./deploy/scripts/deploy.sh` which:
   - Create venv, `./venv/bin/pip install -r backend/requirements.txt`
   - `./venv/bin/python scripts/validate-env.py`
   - `pm2 delete callbot-voice`; `pm2 start ecosystem.config.cjs`
   - `./deploy/scripts/sync-nginx-config.sh`
   - `./deploy/scripts/validate-infra-before-start.sh`

**Secrets required:** `SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USER`, `APP_PATH`

### 2. Manual deploy

```bash
cd /path/to/callbot
./deploy/scripts/deploy.sh
```

### 2b. Manual landing-only deploy

To deploy just the static landing page (served at `https://echodesk.us`):

```bash
cd /path/to/callbot
./deploy/scripts/deploy-landing.sh
```

This script will:

- Validate that `landing/dist/index.html` exists.
- Sync all files from `landing/dist/` to `/var/www/echodesk-landing/`.
- Set safe ownership/permissions for nginx (`www-data` where available).
- Print a short summary of deployed files.

See [DEPLOY_CHECKLIST.md](DEPLOY_CHECKLIST.md) for pre-deploy checks.

### 3. Nginx setup (one-time)

Use the sync script to copy templates and substitute `{{LANDING_ROOT}}`:

```bash
./deploy/scripts/sync-nginx-config.sh
```

Or manually:
- Full SSL: copy `deploy/nginx/callbot.conf.template`, substitute `{{LANDING_ROOT}}` with `$ROOT/landing/dist`
- HTTP only: `deploy/nginx/callbot-http-only.conf.template`
- Ensure SSL cert exists first for full config (see renew-cert.sh)
- `sudo nginx -t && sudo systemctl reload nginx`

## SSL Certificate

- Let's Encrypt via certbot
- Renew: `./deploy/scripts/renew-cert.sh` or `certbot renew --nginx`
- Crontab for auto-renew: `0 3 * * * /path/to/deploy/scripts/renew-cert.sh`

## Env Loading

- `.env` and `.env.local` in project root
- PM2 ecosystem loads them via dotenv before starting apps
- Python backend reads from project root

## Stripe and Google OAuth

- **Stripe webhook URL:** `https://echodesk.us/api/stripe/webhook` (set in Stripe Dashboard)
- **Google OAuth redirect URI:** `https://echodesk.us/api/google/callback` (set in Google Cloud Console)

## Call flow diagnostics

If incoming calls are not answered: run `./deploy/scripts/diagnose-call-flow.sh` on the VPS and see [CALL_FLOW_DIAGNOSTIC.md](CALL_FLOW_DIAGNOSTIC.md).
