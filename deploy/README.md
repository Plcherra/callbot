# Deploy

Deployment configs and scripts for callbot on Hetzner VPS.

## Structure

```
deploy/
├── nginx/
│   ├── callbot.conf.template      # Primary nginx config (echodesk.us pattern)
│   ├── callbot-http-only.conf.template
│   └── websocket-map.conf
├── env/
│   ├── .env.example               # Full env template
│   └── .env.production.example   # Production overrides
├── scripts/
│   ├── deploy.sh                  # Manual backend + services deploy
│   ├── deploy-landing.sh          # Static marketing landing → nginx docroot
│   ├── renew-cert.sh              # SSL cert renewal
│   ├── diagnose-call-flow.sh      # Voice path checks on VPS
│   └── ...
└── README.md
```

**PM2:** use the repo-root **`ecosystem.config.cjs`** (`pm2 start ecosystem.config.cjs` from project root).

## Quick Deploy

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

### Landing deploy troubleshooting

- **Permission denied** when running `./deploy/scripts/deploy-landing.sh`  
  The script is not executable. Use the canonical form: `bash deploy/scripts/deploy-landing.sh`. Or run once: `chmod +x deploy/scripts/deploy-landing.sh`, then `./deploy/scripts/deploy-landing.sh`.

- **`sudo ./deploy/scripts/deploy-landing.sh` → command not found**  
  `sudo` may reset `PATH` or the current directory; the shebang can’t find `bash`. Run without `sudo`: `bash deploy/scripts/deploy-landing.sh` (the script uses `sudo` only for the commands that need it: mkdir, rsync, chown, chmod).

## Docs

Product and ops reference: **`docs/README.md`** (system overview, voice pipeline, SMS, env, runbook).
