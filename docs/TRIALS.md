# Free trials

To offer a free trial (e.g. 14 days):

1. **Stripe**: Create or edit a Price in Stripe and set a **trial period** (e.g. 14 days). Use that price ID for the plan you want to offer as a trial (e.g. `STRIPE_PRICE_STARTER`).
2. **Landing**: The Hero "Start free trial" link sends users to `/signup?plan=starter`. After signup they land on the dashboard and can complete checkout; Stripe Checkout will show the trial terms.
3. **Webhook**: No change needed. When the trial ends, Stripe will charge the customer; `customer.subscription.updated` will fire and your webhook will keep the subscription active.

If you do not set a trial on the Stripe Price, "Start free trial" still routes users to signup with the Starter plan selected; they will be charged at checkout unless the Price has a trial.
