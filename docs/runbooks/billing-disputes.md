# Billing disputes (voice minutes)

## Data sources

- **Authoritative usage**: `usage_ledger` (append-only rows with `entry_hash`).
- **Per-call detail**: `billing_calls` (connected/billable seconds and minutes).
- **Legacy**: `call_usage` for historical Telnyx CDR imports.

## Investigation steps

1. Identify the **customer** (`users.id`) and **billing period** (`period_start`, `period_end`).
2. Sum `usage_ledger.quantity` for that user and period; compare to `included_minutes` in `users.billing_plan_metadata`.
3. Overage minutes = `max(0, sum - included)`; charge = `round(overage * overage_rate_cents)`.
4. Check `subscription_invoices` and Stripe Dashboard for the invoice id in `provider_invoice_id`.

## Adjustments

- Issue **Stripe Credit Note** or manual refund for incorrect invoice amounts.
- If ledger is wrong, append a **correcting** process (do not delete ledger rows); use a support ticket or future `credit` line type if needed.
