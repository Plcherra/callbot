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
│   ├── deploy.sh               # Manual deploy
│   └── renew-cert.sh           # SSL cert renewal
└── README.md
```

## Quick Deploy

```bash
# From project root on VPS
./deploy/scripts/deploy.sh
```

## Docs

See `docs/` for architecture, deployment, environment, Telnyx, troubleshooting, and nginx-explained.
