import Stripe from "stripe";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import { getStripe } from "@/app/lib/stripe";

const SUBSCRIPTION_PLAN_IDS = [
  "subscription_starter",
  "subscription_pro",
  "subscription_business",
] as const;

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
 * For each subscription user with overage minutes, invoice the overage.
 * Also charges phone number fee ($2) for Starter plan when they have a provisioned number.
 * Idempotent: skips if billing_invoices already has (user_id, period_start, 'overage').
 */
export async function invoiceSubscriptionOverageForPreviousMonth(): Promise<{
  invoiced: number;
  skipped: number;
  errors: number;
}> {
  const supabase = createServiceRoleClient();
  const stripe = getStripe();
  const { period_start, period_end } = getPreviousMonthPeriod();

  const { data: users } = await supabase
    .from("users")
    .select("id, stripe_customer_id, billing_plan, billing_plan_metadata")
    .in("billing_plan", [...SUBSCRIPTION_PLAN_IDS])
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
      .eq("invoice_type", "overage")
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const meta = u.billing_plan_metadata as
      | { per_minute_cents?: number; overage_rate_cents?: number; phone_extra_cents?: number }
      | null
      | undefined;
    const perMinuteCents = typeof meta?.overage_rate_cents === "number" ? meta.overage_rate_cents : meta?.per_minute_cents ?? 25;
    const phoneExtraCents = typeof meta?.phone_extra_cents === "number" ? meta.phone_extra_cents : 0;

    const { data: snapshots } = await supabase
      .from("usage_snapshots")
      .select("overage_minutes")
      .eq("user_id", u.id)
      .eq("period_start", period_start);

    const overageMinutes = snapshots?.reduce((s, r) => s + (r.overage_minutes ?? 0), 0) ?? 0;
    const overageCents = overageMinutes * perMinuteCents;

    let phoneFeeCents = 0;
    if (phoneExtraCents > 0) {
      const { data: receptionists } = await supabase
        .from("receptionists")
        .select("id, telnyx_phone_number, twilio_phone_number")
        .eq("user_id", u.id)
        .limit(10);
      const hasNumber = receptionists?.some(
        (r) => r.telnyx_phone_number || r.twilio_phone_number
      );
      if (hasNumber) {
        phoneFeeCents = phoneExtraCents;
      }
    }

    if (overageCents === 0 && phoneFeeCents === 0) {
      skipped++;
      continue;
    }

    try {
      const invoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: "charge_automatically",
        description: `Overage & fees ${period_start} to ${period_end}`,
        metadata: { userId: u.id, period_start },
      });

      if (phoneFeeCents > 0) {
        await stripe.invoiceItems.create({
          customer: customerId,
          amount: phoneFeeCents,
          currency: "usd",
          description: "Phone number (monthly)",
          invoice: invoice.id,
        });
      }
      if (overageCents > 0) {
        await stripe.invoiceItems.create({
          customer: customerId,
          amount: overageCents,
          currency: "usd",
          description: `Overage minutes (${overageMinutes} min)`,
          invoice: invoice.id,
        });
      }

      const finalized = await stripe.invoices.finalizeInvoice(invoice.id);

      const { error: insertErr } = await supabase.from("billing_invoices").insert({
        user_id: u.id,
        period_start,
        invoice_type: "overage",
        stripe_invoice_id: finalized.id,
      });

      if (insertErr) {
        console.error("[billing] overage billing_invoices insert failed", { userId: u.id, period_start, error: insertErr.message });
        errors++;
      } else {
        invoiced++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Stripe error";
      console.error("[billing] overage invoice create failed", { userId: u.id, period_start, error: message });
      errors++;
    }
  }

  return { invoiced, skipped, errors };
}
