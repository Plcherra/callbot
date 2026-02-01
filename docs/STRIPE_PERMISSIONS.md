# Stripe API key permissions

This project uses a **Stripe restricted key** (e.g. named **webhook-ai**) that has the permissions below. The key is scoped to the resources in `stripe-api-key-permissions.csv`.

**Where to set it:** Put the key in `.env.local` as `STRIPE_SECRET_KEY`. Never commit the key to git or paste it in code or docs.

| Resource Type     | Permission   | Use in this app |
|-------------------|-------------|------------------|
| Customers         | Read + Write | Create/retrieve customers on signup or payment (e.g. Checkout) |
| Payment Intents   | Write       | Created by Checkout sessions |
| Prices            | Read        | Reference `STRIPE_PRICE_ID` ($29/mo) |
| Products          | Read        | Validate product exists |
| Subscriptions     | Read + Write | Create and manage recurring subscriptions (Checkout + portal) |
| Checkout Sessions | Write      | Prebuilt Checkout and Buy Button |
| Balance           | Read        | Optional — dashboard/balance (safe) |
| Payouts           | Read        | Optional — payout status (safe) |

## Env vars

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — client (Buy Button, etc.)
- `STRIPE_SECRET_KEY` — server (Checkout, Billing Portal, Customers)
- `STRIPE_PRICE_ID` — server (recurring price for Pro)
- `NEXT_PUBLIC_STRIPE_BUY_BUTTON_ID` — optional (Payment Link buy button)

## Where we use them

- **Checkout**: `app/actions/upgrade.ts` — `checkout.sessions.create`
- **Billing portal**: `app/actions/settings.ts` — `billingPortal.sessions.create` (when `stripe_customer_id` is set)
- **Prices/Products**: Referenced by `STRIPE_PRICE_ID` when creating Checkout sessions
