"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/app/lib/supabase/server";
import { isWizardData } from "./types";
import { createReceptionistFromWizard } from "./wizardHandler";
import { createReceptionistLegacy } from "./legacyHandler";

export type { CreateReceptionistWizardData, CreateReceptionistLegacyData, CreateReceptionistData } from "./types";

export async function createReceptionist(
  data: import("./types").CreateReceptionistData,
  supabaseParam?: SupabaseClient
): Promise<
  | { success: true; id?: string; phoneNumber?: string }
  | { success: false; error: string }
> {
  const supabase = supabaseParam ?? (await createClient());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const { data: profile } = await supabase.from("users").select("subscription_status, calendar_refresh_token").eq("id", user.id).single();
  if (profile?.subscription_status !== "active") return { success: false, error: "Active subscription required." };
  if (!profile?.calendar_refresh_token) {
    return { success: false, error: "Please connect Google Calendar first. Go to Settings → Integrations." };
  }

  if (isWizardData(data)) return createReceptionistFromWizard(supabase, user.id, data);
  return createReceptionistLegacy(supabase, user.id, data);
}
