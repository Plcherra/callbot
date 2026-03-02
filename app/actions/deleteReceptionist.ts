"use server";

import { createClient } from "@/app/lib/supabase/server";
import { releaseNumber } from "@/app/actions/provisionTelnyxNumber";
import { assertReceptionistOwnership } from "@/app/actions/receptionistOwnership";

/**
 * Deletes a receptionist: releases Telnyx number if present, then deletes from DB.
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
    .select("telnyx_phone_number_id, twilio_phone_number_sid")
    .eq("id", receptionistId)
    .single();

  if (!rec) return { success: false, error: "Receptionist not found." };

  const phoneId = rec.telnyx_phone_number_id ?? rec.twilio_phone_number_sid;
  if (phoneId) {
    try {
      await releaseNumber(phoneId);
    } catch (e) {
      console.warn("[deleteReceptionist] Failed to release phone number:", e);
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
