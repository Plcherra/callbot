/**
 * Central plan definitions for subscription tiers.
 * Price IDs are read from env; this file defines display names and metadata.
 */

const SUBSCRIPTION_PLANS = [
  { id: "dev_test", name: "DEV Test", envKey: "STRIPE_PRICE_DEV_TEST", priceCents: 100, includedMinutes: 60, perMinuteCents: 35, phoneExtraCents: 200, billingPlanId: "subscription_dev_test" as const },
  { id: "starter", name: "Starter", envKey: "STRIPE_PRICE_STARTER", priceCents: 6900, includedMinutes: 300, perMinuteCents: 35, phoneExtraCents: 200, billingPlanId: "subscription_starter" as const },
  { id: "pro", name: "Pro", envKey: "STRIPE_PRICE_PRO", priceCents: 14900, includedMinutes: 800, perMinuteCents: 30, phoneExtraCents: 0, billingPlanId: "subscription_pro" as const },
  { id: "business", name: "Business", envKey: "STRIPE_PRICE_BUSINESS", priceCents: 24900, includedMinutes: 1500, perMinuteCents: 25, phoneExtraCents: 0, billingPlanId: "subscription_business" as const },
] as const;

export type SubscriptionPlanId = (typeof SUBSCRIPTION_PLANS)[number]["id"];
export type PlanId = SubscriptionPlanId;

export const subscriptionPlans = SUBSCRIPTION_PLANS;

/** Plans shown on landing and in signup (excludes dev_test). */
export const publicSubscriptionPlanIds: SubscriptionPlanId[] = ["starter", "pro", "business"];

export function getPublicSubscriptionPlans() {
  return SUBSCRIPTION_PLANS.filter((p) => publicSubscriptionPlanIds.includes(p.id));
}

/** All subscription plans (for UI). */
export function getSubscriptionPlans() {
  return SUBSCRIPTION_PLANS.map((p) => ({
    ...p,
    priceId: typeof process !== "undefined" ? (process.env[p.envKey] ?? process.env.STRIPE_PRICE_ID) : undefined,
  }));
}

/**
 * Resolve Stripe price ID from plan id. Falls back to STRIPE_PRICE_ID for starter when STRIPE_PRICE_STARTER not set.
 */
export function getPriceIdForPlanId(planId: PlanId): string | null {
  if (typeof process === "undefined") return null;
  const sub = SUBSCRIPTION_PLANS.find((p) => p.id === planId);
  if (sub) {
    return process.env[sub.envKey] ?? (planId === "starter" ? process.env.STRIPE_PRICE_ID ?? null : null);
  }
  return null;
}

/**
 * Resolve Stripe price ID from Stripe price id (for checkout validation). Returns the same id if it's a known price.
 */
export function resolvePriceId(priceId: string): string | null {
  const all = getSubscriptionPlans()
    .map((p) => p.priceId)
    .filter(Boolean) as string[];
  if (all.includes(priceId)) return priceId;
  if (process.env.STRIPE_PRICE_ID === priceId) return priceId;
  return null;
}

/** Display label for billing_plan + metadata (e.g. "Starter (300 min)"). */
export function getPlanDisplayLabel(
  billingPlan: string | null,
  metadata: BillingPlanMetadata | null
): string {
  if (!billingPlan) return "Free";
  const sub = SUBSCRIPTION_PLANS.find((p) => p.billingPlanId === billingPlan);
  if (sub) {
    const min = metadata?.included_minutes ?? sub.includedMinutes;
    return `${sub.name} (${min} min)`;
  }
  if (billingPlan === "per_minute") {
    return "Legacy plan";
  }
  return billingPlan;
}

/** Short price label for display (e.g. "$69/mo"). */
export function getPlanPriceLabel(
  billingPlan: string | null,
  metadata: BillingPlanMetadata | null
): string {
  if (!billingPlan) return "";
  const sub = SUBSCRIPTION_PLANS.find((p) => p.billingPlanId === billingPlan);
  if (sub) return `$${(sub.priceCents / 100).toFixed(0)}/mo`;
  if (billingPlan === "per_minute") {
    const fee = metadata?.monthly_fee_cents ?? 500;
    const rate = metadata?.per_minute_cents ?? 35;
    return `$${(fee / 100).toFixed(0)} + $${(rate / 100).toFixed(2)}/min`;
  }
  return "";
}

/** Billing plan metadata type (stored in users.billing_plan_metadata). */
export type BillingPlanMetadata = {
  included_minutes?: number;
  monthly_fee_cents?: number;
  per_minute_cents?: number;
  phone_extra_cents?: number;
};

/** Build price-to-plan map for webhook (all plans + legacy STRIPE_PRICE_ID as starter). */
export function getPriceToPlanMap(): Record<
  string,
  { billing_plan: string; billing_plan_metadata: BillingPlanMetadata }
> {
  const map: Record<string, { billing_plan: string; billing_plan_metadata: BillingPlanMetadata }> = {};
  SUBSCRIPTION_PLANS.forEach((p) => {
    const id = process.env[p.envKey];
    if (id) {
      map[id] = {
        billing_plan: p.billingPlanId,
        billing_plan_metadata: {
          included_minutes: p.includedMinutes,
          per_minute_cents: p.perMinuteCents,
          phone_extra_cents: p.phoneExtraCents,
        },
      };
    }
  });
  if (process.env.STRIPE_PRICE_ID && !map[process.env.STRIPE_PRICE_ID]) {
    map[process.env.STRIPE_PRICE_ID] = {
      billing_plan: "subscription_starter",
      billing_plan_metadata: { included_minutes: 300, per_minute_cents: 35, phone_extra_cents: 200 },
    };
  }
  return map;
}
