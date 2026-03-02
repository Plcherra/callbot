# Cron Schedule

Configure these endpoints to run on a schedule (e.g. system cron, Vercel Cron, or GitHub Actions). All require `Authorization: Bearer <CRON_SECRET>`.

## Endpoints

| Endpoint | Schedule | Description |
|----------|----------|-------------|
| `/api/cron/payg-billing` | 1st of month, early (e.g. 00:05 UTC) | PAYG invoicing + overage for fixed plans. Run before reset-usage. |
| `/api/cron/reset-usage` | 1st of month, after payg-billing (e.g. 00:15 UTC) | Reset `user_plans.used_inbound_minutes` and `used_outbound_minutes` to 0. |
| `/api/cron/usage` | Daily (e.g. 02:00 UTC) | Aggregate `call_usage` into `usage_snapshots` for dashboard display. |

## Deprecated

| Endpoint | Status |
|----------|--------|
| `/api/cron/billing` | Deprecated. Overage billing moved to payg-billing. Update your cron to use payg-billing instead. |

## Example (system cron)

```bash
# 1st of month: billing then reset
0 0 1 * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://your-app.com/api/cron/payg-billing
5 0 1 * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://your-app.com/api/cron/reset-usage

# Daily: usage aggregation
0 2 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://your-app.com/api/cron/usage
```

## Vercel Cron

Add to `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/payg-billing", "schedule": "0 0 1 * *" },
    { "path": "/api/cron/reset-usage", "schedule": "5 0 1 * *" },
    { "path": "/api/cron/usage", "schedule": "0 2 * * *" }
  ]
}
```

Schedule format: minute hour day month weekday (cron expression).
