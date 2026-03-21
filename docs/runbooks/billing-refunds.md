# Refunds (voice subscription / overage)

1. Locate the Stripe **Invoice** or **Charge** for the customer.
2. In Stripe Dashboard: **Refund** or **Credit note** against the invoice.
3. Optionally update `subscription_invoices.status` to `void` or add a note in `metadata_json` (if used) for internal audit.
4. Document the reason in your support system.

Negative balances are avoided unless explicitly issuing refunds or credits.
