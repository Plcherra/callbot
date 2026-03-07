"use server";

import { provisionTelnyxNumber, releaseNumber } from "@/app/actions/provisionTelnyxNumber";
import { isPlaceholderUrl } from "@/app/lib/urlUtils";
import { normalizeToE164 } from "@/app/lib/phone";
import { getTelnyxWebhookBase } from "@/app/lib/env";
import type { CreateReceptionistLegacyData } from "./types";

type Supabase = Awaited<ReturnType<typeof import("@/app/lib/supabase/server").createClient>>;

export async function createReceptionistLegacy(
  supabase: Supabase,
  userId: string,
  data: CreateReceptionistLegacyData
): Promise<{ success: true; id?: string } | { success: false; error: string }> {
  const name = data.name?.trim();
  const e164 = data.phone_number?.trim() ? normalizeToE164(data.phone_number.trim()) : null;
  const calendarId = data.calendar_id?.trim();
  if (!name) return { success: false, error: "Name is required." };
  if (!e164) return { success: false, error: "Valid phone number is required." };
  if (!calendarId) return { success: false, error: "Calendar ID is required." };

  const phone = e164.replace(/\D/g, "");
  const localDigits = phone.startsWith("1") && phone.length === 11 ? phone.slice(1) : phone.length === 10 ? phone : "";
  const areaCode = localDigits.length >= 3 ? localDigits.slice(0, 3) : "";
  if (!areaCode || areaCode.length < 3) {
    return { success: false, error: "Could not derive area code. Use a valid 10-digit US/CA number." };
  }

  const webhookBase = getTelnyxWebhookBase();
  if (!webhookBase || isPlaceholderUrl(webhookBase)) {
    return { success: false, error: "TELNYX_WEBHOOK_BASE_URL must be set before provisioning." };
  }

  let telnyxId: string | null = null;
  try {
    const provisionResult = await provisionTelnyxNumber(areaCode);
    if (!provisionResult.success) return { success: false, error: provisionResult.error };
    telnyxId = provisionResult.id;

    const { data: row, error } = await supabase.from("receptionists").insert({
      user_id: userId, name, phone_number: e164, telnyx_phone_number_id: telnyxId,
      telnyx_phone_number: provisionResult.phoneNumber, inbound_phone_number: provisionResult.phoneNumber,
      calendar_id: calendarId, status: "active",
    }).select("id").single();

    if (error) {
      if (telnyxId) { try { await releaseNumber(telnyxId); } catch { /* ignore */ } }
      return { success: false, error: error.message };
    }

    await supabase.from("users").update({ onboarding_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", userId).is("onboarding_completed_at", null);
    return { success: true as const, id: row?.id ?? undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (telnyxId) { try { await releaseNumber(telnyxId); } catch { /* ignore */ } }
    return { success: false, error: process.env.NODE_ENV === "development" ? `Could not activate: ${message}` : "Could not activate. Please try again." };
  }
}
