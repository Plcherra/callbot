"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  provisionTelnyxNumber,
  configureExistingTelnyxNumber,
  releaseNumber,
} from "@/app/actions/provisionTelnyxNumber";
import { isPlaceholderUrl } from "@/app/lib/urlUtils";
import { normalizeToE164 } from "@/app/lib/phone";
import { getTelnyxWebhookBase } from "@/app/lib/env";
import type { CreateReceptionistWizardData } from "./types";
import { buildExtraInstructions } from "./extraInstructions";

type Supabase = Awaited<ReturnType<typeof import("@/app/lib/supabase/server").createClient>>;

export async function createReceptionistFromWizard(
  supabase: Supabase,
  userId: string,
  data: CreateReceptionistWizardData
): Promise<
  | { success: true; id?: string; phoneNumber?: string }
  | { success: false; error: string }
> {
  const name = data.name?.trim();
  const calendarId = data.calendar_id?.trim();
  if (!name) return { success: false, error: "Name is required." };
  if (!calendarId) return { success: false, error: "Calendar ID is required." };

  const webhookBase = getTelnyxWebhookBase();
  if (!webhookBase || isPlaceholderUrl(webhookBase)) {
    return { success: false, error: "TELNYX_WEBHOOK_BASE_URL must be set to your public app URL before provisioning." };
  }

  let inboundNumber: string;
  let telnyxId: string | null = null;
  let telnyxPhoneNumber: string | null = null;

  if (data.phone_strategy === "new") {
    const areaCode = data.area_code === "other" || !data.area_code ? "212" : data.area_code;
    const provisionResult = await provisionTelnyxNumber(areaCode);
    if (!provisionResult.success) {
      const fallbackMsg = data.area_code === "other" ? " Try selecting a specific area code or bring your own number." : "";
      return { success: false, error: provisionResult.error + fallbackMsg };
    }
    inboundNumber = provisionResult.phoneNumber;
    telnyxId = provisionResult.id;
    telnyxPhoneNumber = provisionResult.phoneNumber;
  } else {
    const ownPhone = data.own_phone?.trim();
    if (!ownPhone) return { success: false, error: "Phone number is required." };
    const e164 = normalizeToE164(ownPhone);
    if (!e164) return { success: false, error: "Enter phone in E.164 format (e.g. +15551234567)." };
    inboundNumber = e164;
    if (data.provider_sid?.trim()) {
      const configResult = await configureExistingTelnyxNumber(data.provider_sid.trim());
      if (!configResult.success) return { success: false, error: `Could not configure Telnyx: ${configResult.error}` };
      telnyxId = data.provider_sid.trim();
      telnyxPhoneNumber = ownPhone;
    }
  }

  const extraInstructions = buildExtraInstructions(data);
  try {
    const { data: row, error } = await supabase.from("receptionists").insert({
      user_id: userId, name, phone_number: inboundNumber, inbound_phone_number: inboundNumber,
      telnyx_phone_number_id: telnyxId, telnyx_phone_number: telnyxPhoneNumber, calendar_id: calendarId,
      status: "active", extra_instructions: extraInstructions,
    }).select("id").single();

    if (error) {
      if (data.phone_strategy === "new" && telnyxId) { try { await releaseNumber(telnyxId); } catch { /* ignore */ } }
      return { success: false, error: error.message };
    }

    const receptionistId = row?.id;
    if (receptionistId) {
      const staffList = data.staff?.filter((s) => s.name?.trim()) || [];
      for (const s of staffList) {
        await supabase.from("staff").insert({
          receptionist_id: receptionistId, name: s.name.trim(), role: s.description?.trim() || null,
          specialties: null, is_active: true,
        });
      }
      if (data.promotions?.trim()) {
        await supabase.from("promos").insert({ receptionist_id: receptionistId, description: data.promotions.trim(), code: "WIZARD" });
      }
    }

    await supabase.from("users").update({ onboarding_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", userId).is("onboarding_completed_at", null);
    return { success: true as const, id: row?.id ?? undefined, phoneNumber: inboundNumber };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (data.phone_strategy === "new" && telnyxId) { try { await releaseNumber(telnyxId); } catch { /* ignore */ } }
    return { success: false, error: process.env.NODE_ENV === "development" ? `Could not activate: ${message}` : "Could not activate. Please try again." };
  }
}
