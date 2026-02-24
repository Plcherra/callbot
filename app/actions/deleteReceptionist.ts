"use server";

import { createClient } from "@/app/lib/supabase/server";
import { releaseNumber } from "@/app/lib/twilio";
import { assertReceptionistOwnership } from "@/app/actions/receptionistOwnership";

/**
 * Deletes a receptionist: releases Twilio number if present, then deletes from DB.
 * Related data (staff, services, locations, call_usage, etc.) is cascade-deleted.
 */
export async function deleteReceptionist(
  receptionistId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { success: false, error: ownership.error };

  const supabase = await createClient();
  const { data: rec } = await supabase
    .from("receptionists")
    .select("twilio_phone_number_sid")
    .eq("id", receptionistId)
    .single();

  if (!rec) return { success: false, error: "Receptionist not found." };

  // Release Twilio number if present
  if (rec.twilio_phone_number_sid) {
    try {
      await releaseNumber(rec.twilio_phone_number_sid);
    } catch (e) {
      console.warn("[deleteReceptionist] Failed to release Twilio number:", e);
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
