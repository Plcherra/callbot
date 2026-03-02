/**
 * Quota check for outbound calls.
 * Before initiating outbound, check remaining outbound minutes; block if 0.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type QuotaCheckResult =
  | { allowed: true; remainingMinutes: number }
  | { allowed: false; reason: string };

/**
 * Check if user has remaining outbound minutes.
 * For PAYG users: always allowed (no quota).
 * For fixed plans: check allocated_outbound_minutes - used_outbound_minutes.
 */
export async function checkOutboundQuota(
  supabase: SupabaseClient,
  userId: string
): Promise<QuotaCheckResult> {
  const { data: plan } = await supabase
    .from("user_plans")
    .select("billing_plan, allocated_outbound_minutes, used_outbound_minutes")
    .eq("user_id", userId)
    .maybeSingle();

  if (!plan) {
    return { allowed: false, reason: "No plan configured" };
  }

  if (plan.billing_plan === "subscription_payg") {
    return { allowed: true, remainingMinutes: Infinity };
  }

  const allocated = plan.allocated_outbound_minutes ?? 0;
  const used = Number(plan.used_outbound_minutes ?? 0);
  const remaining = Math.max(0, allocated - used);

  if (remaining <= 0) {
    return { allowed: false, reason: "No outbound minutes remaining this period" };
  }

  return { allowed: true, remainingMinutes: remaining };
}
