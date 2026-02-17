import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/app/lib/stripe";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import { getPriceToPlanMap } from "@/app/lib/plans";

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
  const priceToPlan = getPriceToPlanMap();

  function planFromSubscription(subscription: Stripe.Subscription): {
    billing_plan: string;
    billing_plan_metadata: Record<string, unknown>;
  } | null {
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

      const updates: Record<string, unknown> = {
        id: userId,
        email: email ?? undefined,
        stripe_customer_id: customerId,
        subscription_status: "active",
        updated_at: new Date().toISOString(),
      };
      const sessionSubId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (sessionSubId) {
        updates.stripe_subscription_id = sessionSubId;
        try {
          const stripe = getStripe();
          const subscription = await stripe.subscriptions.retrieve(sessionSubId, { expand: ["items.data.price"] });
          const plan = planFromSubscription(subscription);
          if (plan) {
            updates.billing_plan = plan.billing_plan;
            updates.billing_plan_metadata = plan.billing_plan_metadata;
          }
        } catch (e) {
          console.error("[Stripe webhook] checkout.session.completed: failed to fetch subscription", e);
        }
      }
      const { error } = await supabase
        .from("users")
        .upsert(updates as Record<string, string | null>, { onConflict: "id" });

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
        const plan = planFromSubscription(subscription);
        const update: Record<string, unknown> = {
          subscription_status: status,
          stripe_subscription_id: subscription.id,
          updated_at: new Date().toISOString(),
        };
        if (plan) {
          update.billing_plan = plan.billing_plan;
          update.billing_plan_metadata = plan.billing_plan_metadata;
        }
        await supabase.from("users").update(update as Record<string, string | null>).eq("id", user.id);
        console.log("[Stripe webhook] customer.subscription.*: user", user.id, "status", status, "plan", plan?.billing_plan ?? "none");
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
            billing_plan: null,
            billing_plan_metadata: null,
            stripe_subscription_id: null,
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
