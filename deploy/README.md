# Deploy

Deployment configs and scripts for callbot on Hetzner VPS.

## Structure

```
deploy/
├── nginx/
│   └── callbot.conf.template   # Nginx config for echodesk.us
├── pm2/
│   └── ecosystem.config.cjs    # PM2 config (alt: use root ecosystem.config.cjs)
├── env/
│   ├── .env.example            # Full env template
│   └── .env.production.example # Production overrides
├── scripts/
│   ├── deploy.sh               # Manual backend + services deploy
│   ├── deploy-landing.sh       # Deploy static marketing landing to nginx
│   └── renew-cert.sh           # SSL cert renewal
└── README.md
```

## Quick Deploy

```bash
# From project root on VPS
./deploy/scripts/deploy.sh
```

## Landing Page Deploy (echodesk.us)

The static marketing landing for `https://echodesk.us` is served directly by nginx from `/var/www/echodesk-landing`.

- **Source of truth**: `landing/dist/index.html` (and any other static assets in `landing/dist/`)
- **Deploy target**: `/var/www/echodesk-landing`

You can deploy the landing in two ways:

```bash
# 1) Run with bash (no execute bit required)
bash deploy/scripts/deploy-landing.sh

# 2) Or mark it executable once, then run directly
chmod +x deploy/scripts/deploy-landing.sh
./deploy/scripts/deploy-landing.sh
```

The script syncs `landing/dist/` → `/var/www/echodesk-landing` using `rsync`, then applies safe
ownership and permissions for the nginx user.

## Docs

See `docs/` for architecture, deployment, environment, Telnyx, troubleshooting, and nginx-explained.
