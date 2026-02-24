"use server";

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
    websiteContent: rec.website_content ?? undefined,
    extraInstructions: rec.extra_instructions ?? undefined,
    compact: options?.compact ?? false,
  });

  return { prompt, charCount: prompt.length };
}
