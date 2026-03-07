/**
 * Central plan definitions for subscription tiers.
 * 3 fixed plans + PAYG. Price IDs from env.
 */

const SUBSCRIPTION_PLANS = [
  {
    id: "starter",
    name: "Starter",
    envKey: "STRIPE_PRICE_STARTER",
    priceCents: 6900,
    includedMinutes: 300,
    perMinuteCents: 35,
    overageRateCents: 25,
    paygRateCents: 20,
    phoneExtraCents: 0,
    billingPlanId: "subscription_starter" as const,
  },
  {
    id: "pro",
    name: "Pro",
    envKey: "STRIPE_PRICE_PRO",
    priceCents: 14900,
    includedMinutes: 800,
    perMinuteCents: 30,
    overageRateCents: 25,
    paygRateCents: 20,
    phoneExtraCents: 0,
    billingPlanId: "subscription_pro" as const,
  },
  {
    id: "business",
    name: "Business",
    envKey: "STRIPE_PRICE_BUSINESS",
    priceCents: 24900,
    includedMinutes: 1500,
    perMinuteCents: 25,
    overageRateCents: 25,
    paygRateCents: 20,
    phoneExtraCents: 0,
    billingPlanId: "subscription_business" as const,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    envKey: "STRIPE_PRICE_ENTERPRISE",
    priceCents: 49900,
    includedMinutes: 5000,
    perMinuteCents: 20,
    overageRateCents: 25,
    paygRateCents: 20,
    phoneExtraCents: 0,
    billingPlanId: "subscription_enterprise" as const,
  },
  {
    id: "dev_test",
    name: "DEV test",
    envKey: "STRIPE_PRICE_DEV_TEST",
    priceCents: 100,
    includedMinutes: 50,
    perMinuteCents: 20,
    overageRateCents: 20,
    paygRateCents: 20,
    phoneExtraCents: 0,
    billingPlanId: "subscription_dev_test" as const,
  },
] as const;

const PAYG_PLAN = {
  id: "payg",
  name: "Pay As You Go",
  envKey: "STRIPE_PRICE_PAYG",
  priceCents: 0,
  includedMinutes: 0,
  perMinuteCents: 20,
  overageRateCents: 20,
  paygRateCents: 20,
  phoneExtraCents: 0,
  billingPlanId: "subscription_payg" as const,
} as const;

export type SubscriptionPlanId = (typeof SUBSCRIPTION_PLANS)[number]["id"];
export type PlanId = SubscriptionPlanId | "payg";

export const subscriptionPlans = SUBSCRIPTION_PLANS;
export const paygPlan = PAYG_PLAN;

/** Plans shown on landing and in signup. DEV test excluded (internal use). */
export const publicSubscriptionPlanIds: PlanId[] = ["starter", "pro", "business", "enterprise", "payg"];

export function getPublicSubscriptionPlans() {
  return [...SUBSCRIPTION_PLANS, PAYG_PLAN];
}

/** All subscription plans (for UI). */
export function getSubscriptionPlans() {
  const plans = [...SUBSCRIPTION_PLANS, PAYG_PLAN];
  return plans.map((p) => ({
    ...p,
    priceId: typeof process !== "undefined" ? process.env[p.envKey] : undefined,
  }));
}

/**
 * Resolve Stripe price ID from plan id.
 * Falls back to STRIPE_PRICE_ID for starter when STRIPE_PRICE_STARTER not set.
 */
export function getPriceIdForPlanId(planId: PlanId): string | null {
  if (typeof process === "undefined") return null;
  const sub = [...SUBSCRIPTION_PLANS, PAYG_PLAN].find((p) => p.id === planId);
  if (!sub) return null;
  const id = process.env[sub.envKey];
  if (id) return id;
  if (planId === "starter" && process.env.STRIPE_PRICE_ID) return process.env.STRIPE_PRICE_ID;
  return null;
}

/**
 * Resolve Stripe price ID from Stripe price id (for checkout validation).
 */
export function resolvePriceId(priceId: string): string | null {
  const all = getSubscriptionPlans()
    .map((p) => p.priceId)
    .filter(Boolean) as string[];
  return all.includes(priceId) ? priceId : null;
}

/** Display label for billing_plan + metadata. */
export function getPlanDisplayLabel(
  billingPlan: string | null,
  metadata: BillingPlanMetadata | null
): string {
  if (!billingPlan) return "Free";
  const sub = [...SUBSCRIPTION_PLANS, PAYG_PLAN].find((p) => p.billingPlanId === billingPlan);
  if (sub) {
    if (sub.id === "payg") return "Pay As You Go ($0.20/min)";
    const min = metadata?.included_minutes ?? sub.includedMinutes;
    return `${sub.name} (${min} min)`;
  }
  if (billingPlan === "per_minute") return "Legacy plan";
  return billingPlan;
}

/** Short price label for display. */
export function getPlanPriceLabel(
  billingPlan: string | null,
  metadata: BillingPlanMetadata | null
): string {
  if (!billingPlan) return "";
  const sub = [...SUBSCRIPTION_PLANS, PAYG_PLAN].find((p) => p.billingPlanId === billingPlan);
  if (sub) {
    if (sub.id === "payg") return "$0.20/min";
    return `$${(sub.priceCents / 100).toFixed(0)}/mo`;
  }
  if (billingPlan === "per_minute") {
    const fee = metadata?.monthly_fee_cents ?? 500;
    const rate = metadata?.per_minute_cents ?? 35;
    return `$${(fee / 100).toFixed(0)} + $${(rate / 100).toFixed(2)}/min`;
  }
  return "";
}

/** Billing plan metadata type. */
export type BillingPlanMetadata = {
  included_minutes?: number;
  monthly_fee_cents?: number;
  per_minute_cents?: number;
  overage_rate_cents?: number;
  payg_rate_cents?: number;
  phone_extra_cents?: number;
};

/** Build price-to-plan map for webhook. */
export function getPriceToPlanMap(): Record<
  string,
  { billing_plan: string; billing_plan_metadata: BillingPlanMetadata }
> {
  const map: Record<string, { billing_plan: string; billing_plan_metadata: BillingPlanMetadata }> = {};
  [...SUBSCRIPTION_PLANS, PAYG_PLAN].forEach((p) => {
    const id = process.env[p.envKey];
    if (id) {
      map[id] = {
        billing_plan: p.billingPlanId,
        billing_plan_metadata: {
          included_minutes: p.includedMinutes,
          per_minute_cents: p.perMinuteCents,
          overage_rate_cents: p.overageRateCents,
          payg_rate_cents: p.paygRateCents,
          phone_extra_cents: p.phoneExtraCents,
        },
      };
    }
  });
  return map;
}
