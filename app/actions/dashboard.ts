"use server";

import { createClient } from "@/app/lib/supabase/server";

export async function savePhone(phone: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated." };
  }

  const normalized = phone.replace(/\D/g, "");
  if (normalized.length < 10) {
    return { success: false, error: "Please enter a valid phone number." };
  }
  const e164 = normalized.startsWith("1") && normalized.length === 11
    ? `+${normalized}`
    : normalized.length === 10
    ? `+1${normalized}`
    : `+${normalized}`;

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
