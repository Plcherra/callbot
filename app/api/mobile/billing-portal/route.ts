/**
 * Create Stripe Billing Portal session for mobile. Returns URL to open in browser/WebView.
 * Body: { return_scheme?: "echodesk" }
 */

import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/app/lib/stripe";
import { getAuthUser } from "@/app/lib/supabase/getAuthUser";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const MOBILE_SCHEME = process.env.MOBILE_REDIRECT_SCHEME || "echodesk";

export async function POST(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const returnScheme = (body.return_scheme as string) || MOBILE_SCHEME;

  const { data: profile } = await supabase
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single<{ stripe_customer_id: string | null }>();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing account. Upgrade first." },
      { status: 400 }
    );
  }

  try {
    const stripe = getStripe();
    const returnUrl =
      returnScheme === "echodesk"
        ? `${returnScheme}://settings`
        : `${APP_URL}/settings`;

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnUrl,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
