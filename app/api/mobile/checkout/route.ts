/**
 * Create Stripe Checkout session for mobile. Returns URL to open in browser/WebView.
 * Body: { plan_id?: "starter"|"pro"|"business"|"payg", return_scheme?: "echodesk" }
 */

import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/app/lib/stripe";
import { getAuthUser } from "@/app/lib/supabase/getAuthUser";
import { getPriceIdForPlanId, type PlanId } from "@/app/lib/plans";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const MOBILE_SCHEME = process.env.MOBILE_REDIRECT_SCHEME || "echodesk";

export async function POST(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const planId = (body.plan_id as PlanId) || "starter";
  const returnScheme = (body.return_scheme as string) || MOBILE_SCHEME;

  const priceId = getPriceIdForPlanId(planId) ?? getPriceIdForPlanId("starter");
  if (!priceId) {
    return NextResponse.json(
      { error: "Stripe is not configured or invalid plan." },
      { status: 400 }
    );
  }

  try {
    const stripe = getStripe();
    const successUrl =
      returnScheme === "echodesk"
        ? `${returnScheme}://checkout?session_id={CHECKOUT_SESSION_ID}`
        : `${APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl =
      returnScheme === "echodesk"
        ? `${returnScheme}://checkout?cancelled=1`
        : `${APP_URL}/dashboard`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: user.email,
      metadata: { userId: user.id, email: user.email },
      subscription_data: {
        metadata: { userId: user.id, email: user.email },
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Could not create checkout session." },
        { status: 500 }
      );
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
