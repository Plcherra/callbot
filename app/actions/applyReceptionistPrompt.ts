"use server";

import { createClient } from "@/app/lib/supabase/server";
import { updateAssistant } from "@/app/lib/vapi";
import { buildReceptionistPrompt } from "@/app/lib/buildReceptionistPrompt";
import { assertReceptionistOwnership } from "@/app/actions/receptionistOwnership";
import { listStaff } from "@/app/actions/staff";
import { listServices } from "@/app/actions/services";
import { listLocations } from "@/app/actions/locations";
import { listPromos } from "@/app/actions/promos";
import { listReminderRules } from "@/app/actions/reminderRules";
import { getReceptionist } from "@/app/actions/receptionistSettings";

/**
 * Returns the built system prompt for a receptionist (for preview). Does not call Vapi.
 */
export async function getPromptPreview(
  receptionistId: string,
  options?: { compact?: boolean }
): Promise<{ prompt: string; charCount: number } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };

  const recResult = await getReceptionist(receptionistId);
  if ("error" in recResult) return { error: recResult.error };
  const rec = recResult.data;

  const [staffRes, servicesRes, locationsRes, promosRes, rulesRes] = await Promise.all([
    listStaff(receptionistId),
    listServices(receptionistId),
    listLocations(receptionistId),
    listPromos(receptionistId),
    listReminderRules(receptionistId),
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
    compact: options?.compact ?? false,
  });

  return { prompt, charCount: prompt.length };
}

/**
 * Builds the prompt from DB and PATCHes the Vapi assistant. Requires receptionist to have vapi_assistant_id.
 */
export async function applyPromptToVapi(
  receptionistId: string,
  options?: { compact?: boolean }
): Promise<{ ok: true } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };

  const recResult = await getReceptionist(receptionistId);
  if ("error" in recResult) return { error: recResult.error };
  const rec = recResult.data;

  const vapiAssistantId = rec.vapi_assistant_id;
  if (!vapiAssistantId) {
    return { error: "This receptionist has no Vapi assistant linked. Create it from the receptionists list first." };
  }

  const preview = await getPromptPreview(receptionistId, options);
  if ("error" in preview) return { error: preview.error };

  try {
    await updateAssistant(vapiAssistantId, {
      systemPrompt: preview.prompt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Vapi API error";
    return { error: message };
  }

  const supabase = await createClient();
  await supabase
    .from("receptionists")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", receptionistId);

  return { ok: true };
}
