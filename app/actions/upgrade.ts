"use server";

import { getStripe } from "@/app/lib/stripe";
import { createClient } from "@/app/lib/supabase/server";
import { getPriceIdForPlanId, type PlanId } from "@/app/lib/plans";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function createCheckoutSession(planId?: PlanId | null): Promise<
  { url: string } | { error: string }
> {
  const priceId = planId ? getPriceIdForPlanId(planId) : getPriceIdForPlanId("starter");
  if (!priceId) {
    return { error: "Stripe is not configured or invalid plan." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { error: "You must be logged in to upgrade." };
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/dashboard`,
      customer_email: user.email,
      metadata: {
        userId: user.id,
        email: user.email,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          email: user.email,
        },
      },
    });

    if (!session.url) {
      return { error: "Could not create checkout session." };
    }
    return { url: session.url };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return { error: message };
  }
}
