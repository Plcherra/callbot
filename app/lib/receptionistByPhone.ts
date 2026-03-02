import type { SupabaseClient } from "@supabase/supabase-js";

export type ReceptionistByPhone = {
  id: string;
  name?: string;
  user_id?: string;
};

/**
 * Look up an active receptionist by the "To" phone number (called number).
 * Tries telnyx_phone_number first, then inbound_phone_number.
 */
export async function getReceptionistByPhoneNumber(
  supabase: SupabaseClient,
  to: string
): Promise<ReceptionistByPhone | null> {
  const { data: byTelnyx } = await supabase
    .from("receptionists")
    .select("id, name, user_id")
    .eq("telnyx_phone_number", to)
    .eq("status", "active")
    .maybeSingle();

  if (byTelnyx) return byTelnyx;

  const { data: byInbound } = await supabase
    .from("receptionists")
    .select("id, name, user_id")
    .eq("inbound_phone_number", to)
    .eq("status", "active")
    .maybeSingle();

  return byInbound ?? null;
}
