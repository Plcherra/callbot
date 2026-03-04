"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/app/lib/supabase/server";
import { buildReceptionistPrompt } from "@/app/lib/buildReceptionistPrompt";
import { assertReceptionistOwnership } from "@/app/actions/receptionistOwnership";
import { listStaff } from "@/app/actions/staff";
import { listServices } from "@/app/actions/services";
import { listLocations } from "@/app/actions/locations";
import { listPromos } from "@/app/actions/promos";
import { listReminderRules } from "@/app/actions/reminderRules";
import { getReceptionist } from "@/app/actions/receptionistSettings";

/**
 * Returns the built system prompt for a receptionist (for preview).
 */
export async function getPromptPreview(
  receptionistId: string,
  options?: { compact?: boolean },
  supabaseParam?: SupabaseClient
): Promise<{ prompt: string; charCount: number } | { error: string }> {
  const supabase = supabaseParam ?? (await createClient());
  const ownership = await assertReceptionistOwnership(receptionistId, supabase);
  if (!ownership.ok) return { error: ownership.error };

  const recResult = await getReceptionist(receptionistId, supabase);
  if ("error" in recResult) return { error: recResult.error };
  const rec = recResult.data;

  const [staffRes, servicesRes, locationsRes, promosRes, rulesRes] = await Promise.all([
    listStaff(receptionistId, supabase),
    listServices(receptionistId, supabase),
    listLocations(receptionistId, supabase),
    listPromos(receptionistId, supabase),
    listReminderRules(receptionistId, supabase),
  ]);

  const staff = "data" in staffRes ? staffRes.data : [];
  const services = "data" in servicesRes ? servicesRes.data : [];
  const locations = "data" in locationsRes ? locationsRes.data : [];
  const promos = "data" in promosRes ? promosRes.data : [];
  const reminderRules = "data" in rulesRes ? rulesRes.data : [];

  const prompt = buildReceptionistPrompt({
    name: rec.name,
    phoneNumber: rec.phone_number,
    calendarId: rec.calendar_id ?? "",
    staff,
    services,
    locations,
    promos,
    reminderRules,
    paymentSettings: rec.payment_settings ?? undefined,
    websiteContent: rec.website_content ?? undefined,
    extraInstructions: rec.extra_instructions ?? undefined,
    compact: options?.compact ?? false,
  });

  return { prompt, charCount: prompt.length };
}
