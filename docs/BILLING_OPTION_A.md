# Option A voice minutes billing

## Plans (reference)

| Code    | Monthly | Included minutes | Overage   |
|---------|---------|------------------|-----------|
| starter | $29     | 300              | $0.08/min |
| growth  | $59     | 800              | $0.08/min |
| pro     | $99     | 1,800            | $0.08/min |

## Environment

- `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_PRO` — Stripe Price IDs for recurring monthly subscriptions.
- `INTERNAL_API_KEY` — required for admin billing API (`/api/admin/billing/...`).

## Data model

- `plans` — catalog rows (seeded by migration).
- `subscriptions` — one row per Stripe subscription (synced via webhook).
- `billing_calls` — per-call connected/billable seconds (Telnyx CDR).
- `usage_ledger` — append-only billable minutes per period (`entry_hash` idempotency).
- `subscription_invoices` / `subscription_invoice_line_items` — overage invoices (Stripe `provider_invoice_id`).

## Crons

See [CRON.md](CRON.md): `/api/cron/payg-billing` includes Option A overage close; `/api/cron/billing-reconcile`; `/api/cron/usage-alerts`.

## Runbooks

- [billing-proration.md](runbooks/billing-proration.md)
- [billing-disputes.md](runbooks/billing-disputes.md)
- [billing-refunds.md](runbooks/billing-refunds.md)
