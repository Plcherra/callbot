# Deploy

Deployment configs and scripts for Echodesk on a fresh Ubuntu/Debian VPS, including the new Contabo VPS.

The preferred production shape is:

- **systemd** runs the Python/FastAPI backend on `127.0.0.1:8000`
- **nginx** terminates HTTPS and proxies `/api/*` plus voice WebSocket routes to the backend
- **nginx** serves the static landing page from `/var/www/echodesk-landing`
- **Cloudflare DNS** points `echodesk.us`, `www.echodesk.us`, and `stream.echodesk.us` to the VPS

PM2 support remains in `ecosystem.config.cjs` for legacy deployments, but systemd is simpler and more native for this Python backend.

## Structure

```
deploy/
├── nginx/
│   ├── callbot.conf.template      # Primary nginx config (echodesk.us pattern)
│   ├── callbot-http-only.conf.template
│   └── websocket-map.conf
├── systemd/
│   └── echodesk-backend.service   # Native systemd service for the backend
├── env/
│   ├── .env.example               # Full env template
│   └── .env.production.example   # Production overrides
├── scripts/
│   ├── deploy.sh                  # Manual backend + services deploy
│   ├── deploy-systemd.sh          # Preferred systemd deploy for production
│   ├── deploy-landing.sh          # Static marketing landing → nginx docroot
│   ├── renew-cert.sh              # SSL cert renewal
│   ├── diagnose-call-flow.sh      # Voice path checks on VPS
│   └── ...
└── README.md
```

**Legacy PM2:** use the repo-root **`ecosystem.config.cjs`** (`pm2 start ecosystem.config.cjs` from project root).

## Fresh Contabo VPS Setup

Assumptions:

- OS: Ubuntu 24.04 LTS or Debian 12
- Domain: `echodesk.us`
- App path: `/opt/echodesk/app`
- Service user: `echodesk`
- Backend port: `127.0.0.1:8000`

### 1. Create the app user

Run as `root`:

```bash
adduser --disabled-password --gecos "" echodesk
usermod -aG sudo echodesk
install -d -o echodesk -g echodesk /opt/echodesk
install -d -o echodesk -g echodesk /var/log/echodesk
```

Add your SSH key:

```bash
install -d -m 700 -o echodesk -g echodesk /home/echodesk/.ssh
cp ~/.ssh/authorized_keys /home/echodesk/.ssh/authorized_keys
chown echodesk:echodesk /home/echodesk/.ssh/authorized_keys
chmod 600 /home/echodesk/.ssh/authorized_keys
```

### 2. Harden base access

```bash
apt update
apt install -y ufw fail2ban unattended-upgrades ca-certificates curl git rsync nginx certbot python3-certbot-nginx python3-venv python3-pip nodejs npm
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban
systemctl enable --now nginx
dpkg-reconfigure -plow unattended-upgrades
```

Recommended SSH hardening after confirming key login works:

```bash
sed -i 's/^#\\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\\?PermitRootLogin .*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl reload ssh
```

### 3. Clone the app

As `echodesk`:

```bash
cd /opt/echodesk
git clone <YOUR_REPO_URL> app
cd /opt/echodesk/app
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r backend/requirements.txt
npm install
```

### 4. Create production env

```bash
cd /opt/echodesk/app
cp deploy/env/.env.example .env
chmod 600 .env
nano .env
```

Required production URL values:

```bash
NEXT_PUBLIC_APP_URL=https://echodesk.us
APP_URL=https://echodesk.us
APP_API_BASE_URL=https://echodesk.us
TELNYX_WEBHOOK_BASE_URL=https://echodesk.us
TELNYX_STREAM_BASE_URL=https://stream.echodesk.us
GOOGLE_REDIRECT_URI=https://echodesk.us/api/google/callback
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=https://echodesk.us/api/google/callback
```

Also fill Supabase, Stripe, Telnyx, Deepgram, Grok, Google TTS, Google OAuth, Firebase, and cron secrets.

Store Google TTS credentials outside the repo:

```bash
install -d -m 700 -o echodesk -g echodesk /opt/echodesk/secrets
nano /opt/echodesk/secrets/google-tts.json
chown echodesk:echodesk /opt/echodesk/secrets/google-tts.json
chmod 600 /opt/echodesk/secrets/google-tts.json
```

Then set:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/opt/echodesk/secrets/google-tts.json
```

### 5. Validate the app locally

```bash
cd /opt/echodesk/app
./venv/bin/python scripts/validate-env.py
./venv/bin/python -m pytest backend/tests
bash scripts/check-docs.sh
```

### 6. Install systemd service

Run as `root`:

```bash
cp /opt/echodesk/app/deploy/systemd/echodesk-backend.service /etc/systemd/system/echodesk-backend.service
systemctl daemon-reload
systemctl enable --now echodesk-backend
systemctl status echodesk-backend --no-pager
curl -sS http://127.0.0.1:8000/api/health
```

Logs:

```bash
journalctl -u echodesk-backend -f
```

### 7. Deploy landing and nginx

Run from `/opt/echodesk/app`:

```bash
bash deploy/scripts/deploy-landing.sh
```

Before certificates exist, install HTTP-only nginx config:

```bash
bash deploy/scripts/sync-nginx-config.sh
curl -I -H "Host: echodesk.us" http://127.0.0.1/
curl -s -X POST -H "Host: echodesk.us" -H "Content-Type: application/json" -d '{}' http://127.0.0.1/api/telnyx/voice
```

### 8. DNS and certificates

In DNS, point these records at the Contabo VPS public IPv4:

```text
A echodesk.us        <CONTABO_IPV4>
A www.echodesk.us    <CONTABO_IPV4>
A stream.echodesk.us <CONTABO_IPV4>
```

Use DNS-only for `stream.echodesk.us` if using Cloudflare. Telnyx media streams should not go through a proxy that breaks WebSockets.

After DNS resolves:

```bash
certbot --nginx -d echodesk.us -d www.echodesk.us -d stream.echodesk.us
bash /opt/echodesk/app/deploy/scripts/sync-nginx-config.sh
systemctl reload nginx
```

### 9. Configure providers

Set provider callback URLs:

```text
Telnyx voice webhook:   https://echodesk.us/api/telnyx/voice
Telnyx CDR webhook:     https://echodesk.us/api/telnyx/cdr
Telnyx SMS webhook:     https://echodesk.us/api/telnyx/sms
Stripe webhook:         https://echodesk.us/api/stripe/webhook
Google OAuth callback:  https://echodesk.us/api/google/callback
Voice stream base env:  https://stream.echodesk.us
```

### 10. Final verification

```bash
curl -I https://echodesk.us/
curl -I https://echodesk.us/privacy
curl -sS https://echodesk.us/api/health
curl -sS https://stream.echodesk.us/api/health
sudo nginx -t
systemctl status echodesk-backend --no-pager
```

## Quick Deploy

Preferred systemd deploy:

```bash
# From project root on VPS
bash deploy/scripts/deploy-systemd.sh
```

Legacy PM2 deploy:

```bash
# From project root on VPS
./deploy/scripts/deploy.sh
```

## Landing Page Deploy (echodesk.us)

The static marketing landing for `https://echodesk.us` is served by nginx from `/var/www/echodesk-landing`.

| | Path |
|--|------|
| **Source** | `landing/dist/` (project root) |
| **Target** | `/var/www/echodesk-landing` |

**Canonical command** (from project root on VPS):

```bash
bash deploy/scripts/deploy-landing.sh
```

**Optional:** run as executable after making it executable once:

```bash
chmod +x deploy/scripts/deploy-landing.sh && ./deploy/scripts/deploy-landing.sh
```

The script syncs `landing/dist/` → `/var/www/echodesk-landing` via `rsync`, then sets ownership and permissions for the nginx user.

### Legal and SMS opt-in pages (`/privacy`, `/terms`, `/opt-in`)

Nginx serves clean URLs from static files **`privacy.html`**, **`terms.html`**, and **`opt-in.html`** in the effective `LANDING_ROOT` (prefer `/var/www/echodesk-landing` when that directory exists—see `deploy/scripts/sync-nginx-config.sh`). `sync-nginx-config.sh` **refuses to install** nginx config if any of those files are missing from the chosen root.

**After deploy**, confirm files on disk (production):

```bash
test -f /var/www/echodesk-landing/privacy.html && test -f /var/www/echodesk-landing/terms.html && test -f /var/www/echodesk-landing/opt-in.html && echo "OK: landing HTML files present"
```

**Success is verified with HTTP headers**, not only the browser:

```bash
curl -sI https://echodesk.us/privacy
curl -sI https://echodesk.us/terms
curl -sI https://echodesk.us/opt-in
```

Expected:

- HTTP **200**
- `content-type:` **`text/html`** (optionally with `charset=utf-8`)
- **No** `content-disposition` header (this check should print nothing):

```bash
curl -sI https://echodesk.us/privacy | grep -i content-disposition || true
curl -sI https://echodesk.us/terms | grep -i content-disposition || true
curl -sI https://echodesk.us/opt-in | grep -i content-disposition || true
```

Sanity-check body starts with HTML:

```bash
curl -sL https://echodesk.us/privacy | head -n 3
curl -sL https://echodesk.us/terms | head -n 3
curl -sL https://echodesk.us/opt-in | head -n 10
```

**On the VPS** after syncing nginx:

```bash
bash deploy/scripts/sync-nginx-config.sh
```

(`sync-nginx-config.sh` runs `nginx -t` and reloads nginx. To only test or reload: `sudo nginx -t && sudo systemctl reload nginx`.)

If users still see stale behavior after an origin fix, purge Cloudflare cache once for those URLs.

### Landing deploy troubleshooting

- **Permission denied** when running `./deploy/scripts/deploy-landing.sh`  
  The script is not executable. Use the canonical form: `bash deploy/scripts/deploy-landing.sh`. Or run once: `chmod +x deploy/scripts/deploy-landing.sh`, then `./deploy/scripts/deploy-landing.sh`.

- **`sudo ./deploy/scripts/deploy-landing.sh` → command not found**  
  `sudo` may reset `PATH` or the current directory; the shebang can’t find `bash`. Run without `sudo`: `bash deploy/scripts/deploy-landing.sh` (the script uses `sudo` only for the commands that need it: mkdir, rsync, chown, chmod).

## Docs

Product and ops reference: **`docs/README.md`** (system overview, voice pipeline, SMS, env, runbook).
