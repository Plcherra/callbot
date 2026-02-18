"use server";

import { getStripe } from "@/app/lib/stripe";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import { getPriceToPlanMap } from "@/app/lib/plans";
import type Stripe from "stripe";

/**
 * When user lands on dashboard with ?session_id=... after Checkout,
 * we fetch the session and if paid, update Supabase so they see "Active" and plan immediately (no webhook delay).
 */
export async function syncSubscriptionFromSession(
  sessionId: string,
  currentUserId: string
): Promise<{ synced: boolean; error?: string }> {
  console.log("Processing session_id:", sessionId);
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    if (session.payment_status !== "paid" && session.status !== "complete") {
      return { synced: false };
    }

    const customerId =
      typeof session.customer === "string" ? session.customer : session.customer?.id;
    const userId =
      session.metadata?.userId ??
      (session.client_reference_id as string | null) ??
      null;

    if (!userId || userId !== currentUserId) {
      return { synced: false };
    }

    const updates: Record<string, unknown> = {
      id: userId,
      stripe_customer_id: customerId ?? undefined,
      subscription_status: "active",
      updated_at: new Date().toISOString(),
    };

    // Fetch subscription to get billing_plan (same logic as webhook)
    const sessionSubId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (sessionSubId) {
      updates.stripe_subscription_id = sessionSubId;
      try {
        const subscription = await stripe.subscriptions.retrieve(sessionSubId, {
          expand: ["items.data.price"],
        });
        const plan = planFromSubscription(subscription);
        if (plan) {
          updates.billing_plan = plan.billing_plan;
          updates.billing_plan_metadata = plan.billing_plan_metadata;
        }
      } catch (e) {
        console.error("[syncSubscription] failed to fetch subscription", e);
      }
    }

    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("users")
      .upsert(updates as Record<string, string | null>, { onConflict: "id" });

    if (error) {
      return { synced: false, error: error.message };
    }
    return { synced: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { synced: false, error: message };
  }
}

function planFromSubscription(subscription: Stripe.Subscription): {
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
    return { billing_plan, billing_plan_metadata };
  }
  return null;
}

/**
 * Re-sync billing_plan from Stripe when user has active subscription but billing_plan is missing.
 * Fixes users who subscribed before we added plan sync to syncSubscriptionFromSession.
 * Uses stripe_subscription_id if set, otherwise lists subscriptions by stripe_customer_id.
 */
export async function syncBillingPlanFromStripe(userId: string): Promise<{ synced: boolean }> {
  const supabase = createServiceRoleClient();
  const { data: user } = await supabase
    .from("users")
    .select("stripe_subscription_id, stripe_customer_id, billing_plan")
    .eq("id", userId)
    .single();

  if (user?.billing_plan) return { synced: false };
  if (!user?.stripe_customer_id && !user?.stripe_subscription_id) return { synced: false };

  try {
    const stripe = getStripe();
    let subscription: Stripe.Subscription | null = null;

    if (user.stripe_subscription_id) {
      subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id, {
        expand: ["items.data.price"],
      });
    } else {
      // Fallback: list subscriptions by customer
      const subs = await stripe.subscriptions.list({
        customer: user.stripe_customer_id as string,
        status: "active",
        limit: 1,
        expand: ["data.items.data.price"],
      });
      subscription = subs.data[0] ?? null;
    }

    if (!subscription) return { synced: false };
    const plan = planFromSubscription(subscription);
    if (!plan) return { synced: false };

    const updates: Record<string, unknown> = {
      billing_plan: plan.billing_plan,
      billing_plan_metadata: plan.billing_plan_metadata,
      updated_at: new Date().toISOString(),
    };
    if (!user.stripe_subscription_id) {
      updates.stripe_subscription_id = subscription.id;
    }

    const { error } = await supabase
      .from("users")
      .update(updates as Record<string, string | null>)
      .eq("id", userId);

    return { synced: !error };
  } catch {
    return { synced: false };
  }
}
