"use server";

import { getStripe } from "@/app/lib/stripe";
import { createServiceRoleClient } from "@/app/lib/supabase/server";

/**
 * When user lands on dashboard with ?session_id=... after Checkout,
 * we fetch the session and if paid, update Supabase so they see "Active" immediately (no webhook delay).
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

    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("users")
      .upsert(
        {
          id: userId,
          stripe_customer_id: customerId ?? undefined,
          subscription_status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

    if (error) {
      return { synced: false, error: error.message };
    }
    return { synced: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { synced: false, error: message };
  }
}
