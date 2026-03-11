# Nginx Config Explained

Copy of working nginx config with a comment for every block and location. Use this instead of guessing—wrong configs break SSL or routing.

## Full Config (echodesk.us)

```nginx
# === HTTP: redirect to HTTPS ===
server {
    listen 80;
    listen [::]:80;
    server_name echodesk.us www.echodesk.us;
    return 301 https://$server_name$request_uri;   # 301 permanent redirect
}

# === HTTPS server ===
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name echodesk.us www.echodesk.us;

    # SSL certs (Let's Encrypt). Path must exist; run certbot first.
    ssl_certificate /etc/letsencrypt/live/echodesk.us/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/echodesk.us/privkey.pem;

    # --- VOICE BACKEND (port 8000) - ORDER MATTERS: before location / ---
    # Telnyx webhook: call.initiated POST
    location /api/telnyx/voice {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket for voice stream (Telnyx connects here). Upgrade headers required.
    location /api/voice/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;   # Long calls
        proxy_send_timeout 3600s;
        proxy_connect_timeout 60s;
    }

    # --- NEXT.JS (port 3000) - catch-all ---
    # Everything else: dashboard, /api/telnyx/outbound, /api/telnyx/cdr, /api/internal/*, etc.
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Block-by-block

| Block | Purpose |
|-------|---------|
| `server { listen 80 }` | Redirect HTTP → HTTPS |
| `server { listen 443 ssl }` | Main HTTPS server |
| `ssl_certificate*` | TLS cert paths; must exist |
| `location /api/telnyx/voice` | Telnyx webhook → Python 8000. **Before** `/` or it would hit Next.js |
| `location /api/voice/` | WebSocket → Python 8000. `Upgrade`/`Connection` for WS. Long timeouts for calls |
| `location /` | Catch-all → Next.js 3000 |

## Common Mistakes

- Putting `location /` before voice blocks → `/api/telnyx/voice` hits Next.js (404)
- Omitting `Upgrade`/`Connection` in `/api/voice/` → WebSocket fails
- Wrong `proxy_pass` port → requests go to wrong service
- Missing `proxy_read_timeout` → long calls disconnect (1006)

## Install

```bash
sudo cp deploy/nginx/callbot.conf.template /etc/nginx/sites-available/callbot
sudo ln -sf /etc/nginx/sites-available/callbot /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
