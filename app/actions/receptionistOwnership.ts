"use server";

import { createClient } from "@/app/lib/supabase/server";

/**
 * Verifies the current user owns the receptionist. Returns receptionist id or null.
 */
export async function assertReceptionistOwnership(
  receptionistId: string
): Promise<{ ok: true; receptionistId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated." };
  }
  const { data: rec } = await supabase
    .from("receptionists")
    .select("id")
    .eq("id", receptionistId)
    .eq("user_id", user.id)
    .single();
  if (!rec) {
    return { ok: false, error: "Receptionist not found or access denied." };
  }
  return { ok: true, receptionistId: rec.id };
}
