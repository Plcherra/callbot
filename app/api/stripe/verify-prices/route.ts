import { NextResponse } from "next/server";
import { getStripe } from "@/app/lib/stripe";
import { getPriceIdForPlanId, subscriptionPlans, perMinutePlans, type PlanId } from "@/app/lib/plans";

/**
 * GET /api/stripe/verify-prices
 * Verifies that configured Stripe price IDs exist in the account.
 * Use this to debug "No such price" errors.
 */
export async function GET() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json(
      { error: "STRIPE_SECRET_KEY is not set" },
      { status: 500 }
    );
  }

  const keyMode = secretKey.startsWith("sk_test_") ? "test" : "live";
  const results: { plan: string; priceId: string | null; status: "ok" | "missing" | "error"; message?: string }[] = [];

  const stripe = getStripe();
  const allPlans = [
    ...subscriptionPlans.map((p) => ({ plan: p.name, planId: p.id as PlanId })),
    ...perMinutePlans.map((p) => ({ plan: p.name, planId: p.id as PlanId })),
  ];

  for (const { plan, planId } of allPlans) {
    const priceId = getPriceIdForPlanId(planId);
    if (!priceId) {
      results.push({ plan, priceId: null, status: "missing", message: "No price ID in env" });
      continue;
    }

    try {
      await stripe.prices.retrieve(priceId);
      results.push({ plan, priceId, status: "ok" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      results.push({ plan, priceId, status: "error", message: msg });
    }
  }

  return NextResponse.json({
    keyMode,
    hint: "Stripe keys and price IDs must be from the same account and mode (test vs live).",
    results,
  });
}
