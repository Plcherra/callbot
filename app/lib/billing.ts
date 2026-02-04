import Stripe from "stripe";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import { getStripe } from "@/app/lib/stripe";

function getPreviousMonthPeriod(): { period_start: string; period_end: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  return {
    period_start: first.toISOString().slice(0, 10),
    period_end: last.toISOString().slice(0, 10),
  };
}

/**
 * For each user with billing_plan = 'per_minute', invoice the previous month's usage.
 * Idempotent: skips if billing_invoices already has (user_id, period_start).
 * Uses service role.
 */
export async function invoicePerMinuteUsersForPreviousMonth(): Promise<{
  invoiced: number;
  skipped: number;
  errors: number;
}> {
  const supabase = createServiceRoleClient();
  const stripe = getStripe();
  const { period_start, period_end } = getPreviousMonthPeriod();

  const { data: users } = await supabase
    .from("users")
    .select("id, stripe_customer_id, billing_plan_metadata")
    .eq("billing_plan", "per_minute")
    .not("stripe_customer_id", "is", null);

  if (!users?.length) {
    return { invoiced: 0, skipped: 0, errors: 0 };
  }

  let invoiced = 0;
  let skipped = 0;
  let errors = 0;

  for (const u of users) {
    const customerId = u.stripe_customer_id as string;
    if (!customerId) continue;

    const { data: existing } = await supabase
      .from("billing_invoices")
      .select("stripe_invoice_id")
      .eq("user_id", u.id)
      .eq("period_start", period_start)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const { data: snapshots } = await supabase
      .from("usage_snapshots")
      .select("total_seconds")
      .eq("user_id", u.id)
      .eq("period_start", period_start);

    const totalSeconds = snapshots?.reduce((s, r) => s + (r.total_seconds ?? 0), 0) ?? 0;
    const minutes = Math.ceil(totalSeconds / 60);
    const meta = u.billing_plan_metadata as
      | { monthly_fee_cents?: number; per_minute_cents?: number }
      | null
      | undefined;
    const monthlyFeeCents = typeof meta?.monthly_fee_cents === "number" ? meta.monthly_fee_cents : 500;
    const perMinuteCents = typeof meta?.per_minute_cents === "number" ? meta.per_minute_cents : 35;
    const usageCents = minutes * perMinuteCents;

    try {
      const invoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: "charge_automatically",
        description: `Voice usage ${period_start} to ${period_end}`,
        metadata: { userId: u.id, period_start },
      });

      await stripe.invoiceItems.create({
        customer: customerId,
        amount: monthlyFeeCents,
        currency: "usd",
        description: "Monthly base fee",
        invoice: invoice.id,
      });
      if (usageCents > 0) {
        await stripe.invoiceItems.create({
          customer: customerId,
          amount: usageCents,
          currency: "usd",
          description: `Voice minutes (${minutes} min)`,
          invoice: invoice.id,
        });
      }

      const finalized = await stripe.invoices.finalizeInvoice(invoice.id);

      const { error: insertErr } = await supabase.from("billing_invoices").insert({
        user_id: u.id,
        period_start,
        stripe_invoice_id: finalized.id,
      });

      if (insertErr) {
        console.error("[billing] billing_invoices insert failed", { userId: u.id, period_start, error: insertErr.message });
        errors++;
      } else {
        invoiced++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Stripe error";
      console.error("[billing] invoice create failed", { userId: u.id, period_start, error: message });
      errors++;
    }
  }

  return { invoiced, skipped, errors };
}
