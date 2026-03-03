"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/app/lib/supabase/server";

/**
 * Update inbound/outbound split for the current user's plan.
 * Only works when user has an existing user_plans row (active subscription).
 */
export async function updatePlanSplit(
  inboundPercent: number,
  supabaseParam?: SupabaseClient
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = supabaseParam ?? (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (inboundPercent < 0 || inboundPercent > 100) {
    return { success: false, error: "Inbound percent must be 0–100" };
  }

  const outboundPercent = 100 - inboundPercent;

  const { data: existing } = await supabase
    .from("user_plans")
    .select("user_id, allocated_inbound_minutes, allocated_outbound_minutes")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    return { success: false, error: "No plan found. Subscribe to a plan first." };
  }

  const total =
    (existing.allocated_inbound_minutes ?? 0) +
    (existing.allocated_outbound_minutes ?? 0);

  const updatePayload: {
    inbound_percent: number;
    outbound_percent: number;
    updated_at: string;
    allocated_inbound_minutes?: number;
    allocated_outbound_minutes?: number;
  } = {
    inbound_percent: inboundPercent,
    outbound_percent: outboundPercent,
    updated_at: new Date().toISOString(),
  };

  if (total > 0) {
    updatePayload.allocated_inbound_minutes = Math.floor((total * inboundPercent) / 100);
    updatePayload.allocated_outbound_minutes = total - updatePayload.allocated_inbound_minutes;
  }

  const { error } = await supabase
    .from("user_plans")
    .update(updatePayload)
    .eq("user_id", user.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
