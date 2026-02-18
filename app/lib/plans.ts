/**
 * Central plan definitions for subscription and per-minute tiers.
 * Price IDs are read from env; this file defines display names and metadata.
 */

const SUBSCRIPTION_PLANS = [
  { id: "dev_test", name: "DEV Test", envKey: "STRIPE_PRICE_DEV_TEST", priceCents: 100, includedMinutes: 60, billingPlanId: "subscription_dev_test" as const },
  { id: "starter", name: "Starter", envKey: "STRIPE_PRICE_STARTER", priceCents: 6900, includedMinutes: 300, billingPlanId: "subscription_starter" as const },
  { id: "pro", name: "Pro", envKey: "STRIPE_PRICE_PRO", priceCents: 14900, includedMinutes: 800, billingPlanId: "subscription_pro" as const },
  { id: "business", name: "Business", envKey: "STRIPE_PRICE_BUSINESS", priceCents: 24900, includedMinutes: 1500, billingPlanId: "subscription_business" as const },
  { id: "enterprise", name: "Enterprise", envKey: "STRIPE_PRICE_ENTERPRISE", priceCents: 49900, includedMinutes: 3000, billingPlanId: "subscription_enterprise" as const },
] as const;

const PER_MINUTE_PLANS = [
  { id: "per_minute_1", name: "Pay as you go (Tier 1)", envKey: "STRIPE_PRICE_PER_MINUTE_1", monthlyFeeCents: 500, perMinuteCents: 35 },
  { id: "per_minute_2", name: "Pay as you go (Tier 2)", envKey: "STRIPE_PRICE_PER_MINUTE_2", monthlyFeeCents: 700, perMinuteCents: 30 },
  { id: "per_minute_3", name: "Pay as you go (Tier 3)", envKey: "STRIPE_PRICE_PER_MINUTE_3", monthlyFeeCents: 1000, perMinuteCents: 25 },
] as const;

export type SubscriptionPlanId = (typeof SUBSCRIPTION_PLANS)[number]["id"];
export type PerMinutePlanId = (typeof PER_MINUTE_PLANS)[number]["id"];
export type PlanId = SubscriptionPlanId | PerMinutePlanId;

export const subscriptionPlans = SUBSCRIPTION_PLANS;
export const perMinutePlans = PER_MINUTE_PLANS;

/** All subscription plans (for UI). */
export function getSubscriptionPlans() {
  return SUBSCRIPTION_PLANS.map((p) => ({
    ...p,
    priceId: typeof process !== "undefined" ? (process.env[p.envKey] ?? process.env.STRIPE_PRICE_ID) : undefined,
  }));
}

/** All per-minute plans (for UI). */
export function getPerMinutePlans() {
  return PER_MINUTE_PLANS.map((p) => ({
    ...p,
    priceId: typeof process !== "undefined" ? process.env[p.envKey] : undefined,
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
  const per = PER_MINUTE_PLANS.find((p) => p.id === planId);
  if (per) return process.env[per.envKey] ?? null;
  return null;
}

/**
 * Resolve Stripe price ID from Stripe price id (for checkout validation). Returns the same id if it's a known price.
 */
export function resolvePriceId(priceId: string): string | null {
  const all = [
    ...getSubscriptionPlans().map((p) => p.priceId),
    ...getPerMinutePlans().map((p) => p.priceId),
  ].filter(Boolean) as string[];
  if (all.includes(priceId)) return priceId;
  if (process.env.STRIPE_PRICE_ID === priceId) return priceId;
  return null;
}

/** Display label for billing_plan + metadata (e.g. "Starter (300 min)", "Pay as you go Tier 1"). */
export function getPlanDisplayLabel(
  billingPlan: string | null,
  metadata: { included_minutes?: number; monthly_fee_cents?: number; per_minute_cents?: number } | null
): string {
  if (!billingPlan) return "Free";
  const sub = SUBSCRIPTION_PLANS.find((p) => p.billingPlanId === billingPlan);
  if (sub) {
    const min = metadata?.included_minutes ?? sub.includedMinutes;
    return `${sub.name} (${min} min)`;
  }
  if (billingPlan === "per_minute") {
    const fee = metadata?.monthly_fee_cents ?? 500;
    const rate = metadata?.per_minute_cents ?? 35;
    const tier = PER_MINUTE_PLANS.find((p) => p.monthlyFeeCents === fee && p.perMinuteCents === rate);
    if (tier) return tier.name;
    return `Pay as you go ($${(fee / 100).toFixed(0)} + $${(rate / 100).toFixed(2)}/min)`;
  }
  return billingPlan;
}

/** Short price label for display (e.g. "$49/mo", "$5 + $0.35/min"). */
export function getPlanPriceLabel(
  billingPlan: string | null,
  metadata: { included_minutes?: number; monthly_fee_cents?: number; per_minute_cents?: number } | null
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

/** Build price-to-plan map for webhook (all plans + legacy STRIPE_PRICE_ID as starter). */
export function getPriceToPlanMap(): Record<
  string,
  { billing_plan: string; billing_plan_metadata: { included_minutes?: number; monthly_fee_cents?: number; per_minute_cents?: number } }
> {
  const map: Record<
    string,
    { billing_plan: string; billing_plan_metadata: { included_minutes?: number; monthly_fee_cents?: number; per_minute_cents?: number } }
  > = {};
  SUBSCRIPTION_PLANS.forEach((p) => {
    const id = process.env[p.envKey];
    if (id) map[id] = { billing_plan: p.billingPlanId, billing_plan_metadata: { included_minutes: p.includedMinutes } };
  });
  if (process.env.STRIPE_PRICE_ID && !map[process.env.STRIPE_PRICE_ID]) {
    map[process.env.STRIPE_PRICE_ID] = { billing_plan: "subscription_starter", billing_plan_metadata: { included_minutes: 300 } };
  }
  PER_MINUTE_PLANS.forEach((p) => {
    const id = process.env[p.envKey];
    if (id) map[id] = { billing_plan: "per_minute", billing_plan_metadata: { monthly_fee_cents: p.monthlyFeeCents, per_minute_cents: p.perMinuteCents } };
  });
  return map;
}
