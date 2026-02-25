"use server";

import { createClient } from "@/app/lib/supabase/server";
import { normalizeToE164 } from "@/app/lib/phone";

export async function savePhone(phone: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated." };
  }

  const e164 = normalizeToE164(phone);
  if (!e164) {
    return { success: false, error: "Please enter a valid phone number." };
  }

  const { error } = await supabase
    .from("users")
    .update({
      phone: e164,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}
