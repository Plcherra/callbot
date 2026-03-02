/**
 * PAYG billing and overage logic.
 * PAYG: sum payg_minutes per user per month → Stripe invoice.
 * Overage: fixed plans exceed allocated → charge at overage_rate_cents.
 */

import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

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

/** Minimum PAYG invoice: $5/month when user has usage. */
const PAYG_MIN_CENTS = 500;

/**
 * Invoice PAYG users for the previous month.
 * Sum call_usage.payg_minutes (or all minutes for PAYG users) × payg_rate_cents.
 * Minimum charge: $5 when user has any usage.
 */
export async function invoicePaygForPreviousMonth(
  supabase: SupabaseClient,
  stripe: Stripe
): Promise<{ invoiced: number; skipped: number; errors: number }> {
  const { period_start, period_end } = getPreviousMonthPeriod();

  const { data: paygUsers } = await supabase
    .from("users")
    .select("id, stripe_customer_id")
    .eq("billing_plan", "subscription_payg")
    .not("stripe_customer_id", "is", null);

  if (!paygUsers?.length) {
    return { invoiced: 0, skipped: 0, errors: 0 };
  }

  let invoiced = 0;
  let skipped = 0;
  let errors = 0;

  for (const u of paygUsers) {
    const customerId = u.stripe_customer_id as string;
    if (!customerId) continue;

    const { data: existing } = await supabase
      .from("billing_invoices")
      .select("stripe_invoice_id")
      .eq("user_id", u.id)
      .eq("period_start", period_start)
      .eq("invoice_type", "payg")
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const { data: usageRows } = await supabase
      .from("call_usage")
      .select("payg_minutes, billed_minutes, duration_seconds")
      .eq("user_id", u.id)
      .gte("ended_at", `${period_start}T00:00:00.000Z`)
      .lte("ended_at", `${period_end}T23:59:59.999Z`);

    const totalMinutes =
      usageRows?.reduce((sum, r) => {
        const mins = r.payg_minutes ?? r.billed_minutes ?? (r.duration_seconds ?? 0) / 60;
        return sum + Number(mins);
      }, 0) ?? 0;

    if (totalMinutes <= 0) {
      skipped++;
      continue;
    }

    const paygRateCents = 20;
    const amountCents = Math.max(PAYG_MIN_CENTS, Math.ceil(totalMinutes * paygRateCents));

    try {
      const invoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: "charge_automatically",
        description: `PAYG minutes ${period_start} to ${period_end}`,
        metadata: { userId: u.id, period_start },
      });

      await stripe.invoiceItems.create({
        customer: customerId,
        amount: amountCents,
        currency: "usd",
        description: `Pay As You Go (${totalMinutes.toFixed(1)} min @ $0.20/min)`,
        invoice: invoice.id,
      });

      await stripe.invoices.finalizeInvoice(invoice.id);

      await supabase.from("billing_invoices").insert({
        user_id: u.id,
        period_start,
        invoice_type: "payg",
        stripe_invoice_id: invoice.id,
      });

      invoiced++;
    } catch (err) {
      console.error("[usageBilling] PAYG invoice failed", { userId: u.id, error: err });
      errors++;
    }
  }

  return { invoiced, skipped, errors };
}

/**
 * Invoice overage for fixed-plan users who exceeded allocated minutes.
 * Uses user_plans.used_*_minutes (run before reset-usage cron on the 1st).
 */
export async function invoiceOverageForFixedPlans(
  supabase: SupabaseClient,
  stripe: Stripe
): Promise<{ invoiced: number; skipped: number; errors: number }> {
  const { period_start, period_end } = getPreviousMonthPeriod();

  const { data: plans } = await supabase
    .from("user_plans")
    .select("user_id, allocated_inbound_minutes, allocated_outbound_minutes, used_inbound_minutes, used_outbound_minutes, overage_rate_cents")
    .not("allocated_inbound_minutes", "is", null);

  let invoiced = 0;
  let skipped = 0;
  let errors = 0;

  for (const p of plans ?? []) {
    const allocated =
      (p.allocated_inbound_minutes ?? 0) + (p.allocated_outbound_minutes ?? 0);
    const used =
      Number(p.used_inbound_minutes ?? 0) + Number(p.used_outbound_minutes ?? 0);
    const overageMinutes = Math.max(0, used - allocated);
    if (overageMinutes <= 0) {
      skipped++;
      continue;
    }

    const { data: user } = await supabase
      .from("users")
      .select("stripe_customer_id")
      .eq("id", p.user_id)
      .single();
    const customerId = user?.stripe_customer_id as string | null;
    if (!customerId) {
      skipped++;
      continue;
    }

    const { data: existing } = await supabase
      .from("billing_invoices")
      .select("stripe_invoice_id")
      .eq("user_id", p.user_id)
      .eq("period_start", period_start)
      .eq("invoice_type", "overage")
      .maybeSingle();
    if (existing) {
      skipped++;
      continue;
    }

    const rate = p.overage_rate_cents ?? 25;
    const amountCents = Math.ceil(overageMinutes * rate);

    try {
      const invoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: "charge_automatically",
        description: `Overage minutes ${period_start} to ${period_end}`,
        metadata: { userId: p.user_id, period_start },
      });

      await stripe.invoiceItems.create({
        customer: customerId,
        amount: amountCents,
        currency: "usd",
        description: `Overage (${overageMinutes.toFixed(1)} min @ $${(rate / 100).toFixed(2)}/min)`,
        invoice: invoice.id,
      });

      await stripe.invoices.finalizeInvoice(invoice.id);

      await supabase.from("billing_invoices").insert({
        user_id: p.user_id,
        period_start,
        invoice_type: "overage",
        stripe_invoice_id: invoice.id,
      });

      invoiced++;
    } catch (err) {
      console.error("[usageBilling] Overage invoice failed", {
        userId: p.user_id,
        error: err,
      });
      errors++;
    }
  }

  return { invoiced, skipped, errors };
}
