# Cron Schedule

Configure these endpoints to run on a schedule. All require `Authorization: Bearer <CRON_SECRET>`.

## Endpoints

| Endpoint | Schedule | Description |
|----------|----------|-------------|
| `/api/cron/payg-billing` | 1st of month, early (e.g. 00:05 UTC) | PAYG invoicing + overage for fixed plans. Run before reset-usage. |
| `/api/cron/reset-usage` | 1st of month, after payg-billing (e.g. 00:15 UTC) | Reset `user_plans.used_inbound_minutes` and `used_outbound_minutes` to 0. |
| `/api/cron/usage` | Daily (e.g. 02:00 UTC) | Aggregate `call_usage` into `usage_snapshots` for dashboard display. |

## Hetzner VPS / system cron

Add to crontab (`crontab -e`) or drop a file into `/etc/cron.d/echodesk`:

```bash
# Set your app URL and secret (or use env vars)
APP_URL=https://echodesk.us
CRON_SECRET=your_cron_secret

# 1st of month: billing then reset (run payg-billing first)
0 0 1 * * curl -s -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/payg-billing
5 0 1 * * curl -s -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/reset-usage

# Daily: usage aggregation
0 2 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/usage
```

For `/etc/cron.d/`, create `/etc/cron.d/echodesk`:

```
SHELL=/bin/bash
PATH=/usr/bin:/bin
0 0 1 * * root curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://echodesk.us/api/cron/payg-billing
5 0 1 * * root curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://echodesk.us/api/cron/reset-usage
0 2 * * * root curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://echodesk.us/api/cron/usage
```

Or use a wrapper script that sources env from a file:

```bash
#!/bin/bash
# /opt/echodesk/cron-run.sh
source /opt/echodesk/.env.cron
curl -s -H "Authorization: Bearer $CRON_SECRET" "$APP_URL$1"
```

Then in crontab: `0 0 1 * * /opt/echodesk/cron-run.sh /api/cron/payg-billing`

Schedule format: minute hour day month weekday (cron expression).

## FastAPI backend proxy (optional)

If cron runs on the same server as the FastAPI voice backend, you can call its proxy instead:

```bash
# Backend forwards to Next.js; set APP_API_BASE_URL and CRON_SECRET in backend .env
0 0 1 * * curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:8000/api/cron/payg-billing
```

The backend's `/api/cron/payg-billing` proxies to `$APP_API_BASE_URL/api/cron/payg-billing`.
