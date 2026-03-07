"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/app/lib/supabase/server";
import { releaseNumber } from "@/app/actions/provisionTelnyxNumber";
import { assertReceptionistOwnership } from "@/app/actions/receptionistOwnership";

/**
 * Deletes a receptionist: releases Telnyx number if present, then deletes from DB.
 * Related data (staff, services, locations, call_usage, etc.) is cascade-deleted.
 */
export async function deleteReceptionist(
  receptionistId: string,
  supabaseParam?: SupabaseClient
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = supabaseParam ?? (await createClient());
  const ownership = await assertReceptionistOwnership(receptionistId, supabase);
  if (!ownership.ok) return { success: false, error: ownership.error };
  const { data: rec } = await supabase
    .from("receptionists")
    .select("telnyx_phone_number_id")
    .eq("id", receptionistId)
    .single();

  if (!rec) return { success: false, error: "Receptionist not found." };

  if (rec.telnyx_phone_number_id) {
    try {
      await releaseNumber(rec.telnyx_phone_number_id);
    } catch (e) {
      console.warn("[deleteReceptionist] Failed to release Telnyx number:", e);
    }
  }

  const { error } = await supabase
    .from("receptionists")
    .delete()
    .eq("id", receptionistId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
