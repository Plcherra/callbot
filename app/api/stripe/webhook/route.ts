import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/app/lib/stripe";
import { createServiceRoleClient } from "@/app/lib/supabase/server";

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !webhookSecret) {
    console.error("[Stripe webhook] Missing signature or STRIPE_WEBHOOK_SECRET");
    return NextResponse.json(
      { error: "Missing signature or webhook secret" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Stripe webhook] Signature verification failed:", message);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  console.log("[Stripe webhook] Event received:", event.type, event.id);

  const supabase = createServiceRoleClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      let userId =
        session.metadata?.userId ??
        (session.client_reference_id as string | null) ??
        null;
      const email =
        session.metadata?.email ??
        session.customer_email ??
        session.customer_details?.email;
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id;

      if (!customerId) {
        console.log("[Stripe webhook] checkout.session.completed: no customer id");
        break;
      }

      if (!userId && email) {
        const { data: userByEmail } = await supabase
          .from("users")
          .select("id")
          .eq("email", email)
          .single();
        userId = userByEmail?.id ?? null;
      }

      if (!userId) {
        console.log("[Stripe webhook] checkout.session.completed: no userId found");
        break;
      }

      const { error } = await supabase
        .from("users")
        .upsert(
          {
            id: userId,
            email: email ?? undefined,
            stripe_customer_id: customerId,
            subscription_status: "active",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );

      if (error) {
        console.error("[Stripe webhook] checkout.session.completed upsert error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      console.log("[Stripe webhook] checkout.session.completed: user", userId, "set active");
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const status = subscription.status;

      const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (user) {
        await supabase
          .from("users")
          .update({
            subscription_status: status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);
        console.log("[Stripe webhook] customer.subscription.*: user", user.id, "status", status);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (user) {
        await supabase
          .from("users")
          .update({
            subscription_status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);
        console.log("[Stripe webhook] customer.subscription.deleted: user", user.id);
      }
      break;
    }

    default:
      console.log("[Stripe webhook] Unhandled event type:", event.type);
  }

  return NextResponse.json({ received: true });
}
