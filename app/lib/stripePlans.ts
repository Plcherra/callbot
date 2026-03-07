import type Stripe from "stripe";
import { getPriceToPlanMap } from "./plans";

/**
 * Resolve billing_plan and metadata from a Stripe subscription.
 * Uses getPriceToPlanMap for configured price IDs, or falls back to Price metadata.
 */
export function planFromSubscription(subscription: Stripe.Subscription): {
  billing_plan: string;
  billing_plan_metadata: Record<string, unknown>;
} | null {
  const priceToPlan = getPriceToPlanMap();
  const items = subscription.items?.data ?? [];
  const price = items[0]?.price;
  const priceId = typeof price === "string" ? price : price?.id;
  if (typeof priceId !== "string") return null;
  const plan = priceToPlan[priceId];
  if (plan) return plan;
  const meta = typeof price === "object" ? price?.metadata : undefined;
  if (meta?.plan) {
    const billing_plan = String(meta.plan);
    const billing_plan_metadata: Record<string, unknown> = {};
    if (meta.included_minutes != null) {
      const included = parseInt(String(meta.included_minutes), 10);
      if (!Number.isNaN(included)) billing_plan_metadata.included_minutes = included;
    }
    if (meta.monthly_fee_cents != null) {
      const fee = parseInt(String(meta.monthly_fee_cents), 10);
      if (!Number.isNaN(fee)) billing_plan_metadata.monthly_fee_cents = fee;
    }
    if (meta.per_minute_cents != null) {
      const rate = parseInt(String(meta.per_minute_cents), 10);
      if (!Number.isNaN(rate)) billing_plan_metadata.per_minute_cents = rate;
    }
    if (meta.phone_extra_cents != null) {
      const phoneExtra = parseInt(String(meta.phone_extra_cents), 10);
      if (!Number.isNaN(phoneExtra)) billing_plan_metadata.phone_extra_cents = phoneExtra;
    }
    return { billing_plan, billing_plan_metadata };
  }
  return null;
}
