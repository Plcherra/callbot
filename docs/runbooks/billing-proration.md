# Billing proration (Option A)

## Policy

- **Upgrades mid-cycle**: Prefer Stripe’s built-in proration for the **recurring base fee** when changing subscription price. Included voice minutes are **not** pro-rated mid-cycle in this implementation; the `included_minutes` in `users.billing_plan_metadata` reflects the **current** plan. For strict pro-rated included minutes, either schedule plan changes at period boundaries or extend metadata with `pro_rated_included` (future work).

- **Downgrades**: Default to **effective next period** (`cancel_at_period_end` + new plan at renewal) to avoid billing disputes.

- **Usage**: `usage_ledger` quantities are attributed to the **subscription period** active when the call ended (`period_start` / `period_end` on each ledger row).

## Stripe

- Configure products/prices for Starter ($29), Growth ($59), Pro ($99).
- Overage is charged via **Stripe Invoice** + **InvoiceItem** after the period closes (`option_a_invoice_closed_periods` in the monthly billing cron), not as a metered price by default.
