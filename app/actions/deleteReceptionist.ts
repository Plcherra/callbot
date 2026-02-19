"use server";

import { createClient } from "@/app/lib/supabase/server";
import { deleteAssistant, deletePhoneNumber } from "@/app/lib/vapi";
import { assertReceptionistOwnership } from "@/app/actions/receptionistOwnership";

/**
 * Deletes a receptionist: removes Vapi assistant and phone number, then deletes from DB.
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
    .select("vapi_assistant_id, vapi_phone_number_id")
    .eq("id", receptionistId)
    .single();

  if (!rec) return { success: false, error: "Receptionist not found." };

  // Delete Vapi resources first (best-effort; continue even if they fail)
  if (rec.vapi_phone_number_id) {
    try {
      await deletePhoneNumber(rec.vapi_phone_number_id);
    } catch (e) {
      console.warn("[deleteReceptionist] Failed to delete Vapi phone number:", e);
    }
  }
  if (rec.vapi_assistant_id) {
    try {
      await deleteAssistant(rec.vapi_assistant_id);
    } catch (e) {
      console.warn("[deleteReceptionist] Failed to delete Vapi assistant:", e);
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
