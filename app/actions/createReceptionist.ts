"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/app/lib/supabase/server";
import {
  provisionTelnyxNumber,
  configureExistingTelnyxNumber,
  releaseNumber,
} from "@/app/actions/provisionTelnyxNumber";
import { isPlaceholderUrl } from "@/app/lib/urlUtils";
import { normalizeToE164 } from "@/app/lib/phone";
import { getTelnyxWebhookBase } from "@/app/lib/env";

/** Wizard payload from AddReceptionistWizardModal */
export type CreateReceptionistWizardData = {
  name: string;
  country: string;
  calendar_id: string;
  phone_strategy: "new" | "own";
  area_code?: string;
  own_phone?: string;
  provider_sid?: string;
  system_prompt: string;
  staff?: Array<{ name: string; description: string }>;
  promotions?: string;
  business_hours?: string;
  voice_personality?: string;
  fallback_behavior?: string;
  max_call_duration_minutes?: number;
};

/** Legacy payload from AddReceptionistForm */
export type CreateReceptionistLegacyData = {
  name: string;
  phone_number: string;
  calendar_id: string;
  country: string;
};

export type CreateReceptionistData =
  | CreateReceptionistWizardData
  | CreateReceptionistLegacyData;

function isWizardData(
  data: CreateReceptionistData
): data is CreateReceptionistWizardData {
  return "phone_strategy" in data && data.phone_strategy !== undefined;
}

export async function createReceptionist(
  data: CreateReceptionistData,
  supabaseParam?: SupabaseClient
): Promise<
  | { success: true; id?: string; phoneNumber?: string }
  | { success: false; error: string }
> {
  const supabase = supabaseParam ?? (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated." };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, calendar_refresh_token")
    .eq("id", user.id)
    .single();

  if (profile?.subscription_status !== "active") {
    return { success: false, error: "Active subscription required." };
  }

  if (!profile?.calendar_refresh_token) {
    return {
      success: false,
      error:
        "Please connect Google Calendar first (Step 1). Go to Settings → Integrations or complete the step above.",
    };
  }

  if (isWizardData(data)) {
    return createReceptionistFromWizard(supabase, user.id, data);
  }
  return createReceptionistLegacy(supabase, user.id, data);
}

async function createReceptionistFromWizard(
  supabase: Awaited<ReturnType<typeof import("@/app/lib/supabase/server").createClient>>,
  userId: string,
  data: CreateReceptionistWizardData
): Promise<
  | { success: true; id?: string; phoneNumber?: string }
  | { success: false; error: string }
> {
  const name = data.name?.trim();
  const calendarId = data.calendar_id?.trim();
  const country = data.country?.trim().toUpperCase() || "US";

  if (!name) return { success: false, error: "Name is required." };
  if (!calendarId) return { success: false, error: "Calendar ID is required." };

  const webhookBase = getTelnyxWebhookBase();
  if (!webhookBase || isPlaceholderUrl(webhookBase)) {
    return {
      success: false,
      error:
        "TELNYX_WEBHOOK_BASE_URL must be set to your public app URL before provisioning.",
    };
  }

  let inboundNumber: string;
  let telnyxId: string | null = null;
  let telnyxPhoneNumber: string | null = null;

  if (data.phone_strategy === "new") {
    const areaCode =
      data.area_code === "other" || !data.area_code ? "212" : data.area_code;
    const provisionResult = await provisionTelnyxNumber(areaCode);
    if (!provisionResult.success) {
      const fallbackMsg = data.area_code === "other"
        ? " Try selecting a specific area code (212, 310, 415) or bring your own number."
        : "";
      return {
        success: false,
        error: provisionResult.error + fallbackMsg,
      };
    }
    inboundNumber = provisionResult.phoneNumber;
    telnyxId = provisionResult.id;
    telnyxPhoneNumber = provisionResult.phoneNumber;
  } else {
    const ownPhone = data.own_phone?.trim();
    if (!ownPhone) {
      return { success: false, error: "Phone number is required." };
    }
    const e164 = normalizeToE164(ownPhone);
    if (!e164) {
      return {
        success: false,
        error: "Enter phone in E.164 format (e.g. +15551234567).",
      };
    }
    inboundNumber = e164;

    if (data.provider_sid?.trim()) {
      const configResult = await configureExistingTelnyxNumber(
        data.provider_sid.trim()
      );
      if (!configResult.success) {
        return {
          success: false,
          error: `Could not configure Telnyx number: ${configResult.error}`,
        };
      }
      telnyxId = data.provider_sid.trim();
      telnyxPhoneNumber = ownPhone;
    }
  }

  const customPrompt = data.system_prompt?.trim();
  const extraParts: string[] = [];
  if (customPrompt) {
    extraParts.push(customPrompt);
  }
  if (data.voice_personality) {
    extraParts.push(`Voice personality: ${data.voice_personality}.`);
  }
  if (data.fallback_behavior) {
    extraParts.push(
      `Fallback if AI cannot help: ${data.fallback_behavior === "voicemail" ? "take voicemail" : "transfer to human"}.`
    );
  }
  if (data.max_call_duration_minutes) {
    extraParts.push(
      `Max call duration: ${data.max_call_duration_minutes} minutes.`
    );
  }
  if (data.business_hours) {
    extraParts.push(`Business hours: ${data.business_hours}`);
  }
  const extraInstructions =
    extraParts.length > 0 ? extraParts.join("\n\n") : undefined;

  try {
    const { data: row, error } = await supabase
      .from("receptionists")
      .insert({
        user_id: userId,
        name,
        phone_number: inboundNumber,
        inbound_phone_number: inboundNumber,
        telnyx_phone_number_id: telnyxId,
        telnyx_phone_number: telnyxPhoneNumber,
        calendar_id: calendarId,
        status: "active",
        extra_instructions: extraInstructions,
      })
      .select("id")
      .single();

    if (error) {
      if (data.phone_strategy === "new" && telnyxId) {
        try {
          await releaseNumber(telnyxId);
        } catch {
          /* best-effort */
        }
      }
      return { success: false, error: error.message };
    }

    const receptionistId = row?.id;
    if (receptionistId) {
      const staffList = data.staff?.filter((s) => s.name?.trim()) || [];
      for (const s of staffList) {
        await supabase.from("staff").insert({
          receptionist_id: receptionistId,
          name: s.name.trim(),
          role: s.description?.trim() || null,
          specialties: null,
          is_active: true,
        });
      }

      if (data.promotions?.trim()) {
        await supabase.from("promos").insert({
          receptionist_id: receptionistId,
          description: data.promotions.trim(),
          code: "WIZARD",
        });
      }
    }

    await supabase
      .from("users")
      .update({
        onboarding_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .is("onboarding_completed_at", null);

    return {
      success: true as const,
      id: row?.id ?? undefined,
      phoneNumber: inboundNumber,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[createReceptionist] Wizard Error:", err);
    if (data.phone_strategy === "new" && telnyxId) {
      try {
        await releaseNumber(telnyxId);
      } catch {
        /* best-effort */
      }
    }
    return {
      success: false,
      error:
        process.env.NODE_ENV === "development"
          ? `Could not activate your AI receptionist: ${message}`
          : "Could not activate your AI receptionist. Please try again or contact support.",
    };
  }
}

async function createReceptionistLegacy(
  supabase: Awaited<ReturnType<typeof import("@/app/lib/supabase/server").createClient>>,
  userId: string,
  data: CreateReceptionistLegacyData
): Promise<{ success: true; id?: string } | { success: false; error: string }> {
  const name = data.name?.trim();
  const phoneRaw = data.phone_number?.trim();
  const calendarId = data.calendar_id?.trim();
  const country = data.country?.trim().toUpperCase() || "US";

  if (!name) return { success: false, error: "Name is required." };
  const e164 = phoneRaw ? normalizeToE164(phoneRaw) : null;
  if (!e164)
    return { success: false, error: "Valid phone number is required." };
  if (!calendarId) return { success: false, error: "Calendar ID is required." };

  const phone = e164.replace(/\D/g, "");

  const localDigits =
    phone.startsWith("1") && phone.length === 11
      ? phone.slice(1)
      : phone.length === 10
        ? phone
        : "";
  const areaCode =
    localDigits.length >= 3 ? localDigits.slice(0, 3) : "";

  if (!areaCode || areaCode.length < 3) {
    return {
      success: false,
      error:
        "Could not derive area code from phone number. Use a valid 10-digit US/CA number.",
    };
  }

  const webhookBase = getTelnyxWebhookBase();
  if (!webhookBase || isPlaceholderUrl(webhookBase)) {
    return {
      success: false,
      error:
        "TELNYX_WEBHOOK_BASE_URL must be set to your public app URL before provisioning a Telnyx number.",
    };
  }

  let telnyxId: string | null = null;
  try {
    const provisionResult = await provisionTelnyxNumber(areaCode);
    if (!provisionResult.success) {
      return { success: false, error: provisionResult.error };
    }
    telnyxId = provisionResult.id;
    const inboundNumber = provisionResult.phoneNumber;

    const { data: row, error } = await supabase
      .from("receptionists")
      .insert({
        user_id: userId,
        name,
        phone_number: e164,
        telnyx_phone_number_id: telnyxId,
        telnyx_phone_number: inboundNumber,
        inbound_phone_number: inboundNumber,
        calendar_id: calendarId,
        status: "active",
      })
      .select("id")
      .single();

    if (error) {
      if (telnyxId) {
        try {
          await releaseNumber(telnyxId);
        } catch {
          /* best-effort */
        }
      }
      return { success: false, error: error.message };
    }

    await supabase
      .from("users")
      .update({
        onboarding_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .is("onboarding_completed_at", null);

    return { success: true as const, id: row?.id ?? undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[createReceptionist] Telnyx Error:", err);
    if (telnyxId) {
      try {
        await releaseNumber(telnyxId);
      } catch {
        /* best-effort */
      }
    }
    return {
      success: false,
      error:
        process.env.NODE_ENV === "development"
          ? `Could not activate your AI receptionist: ${message}`
          : "Could not activate your AI receptionist. Please try again or contact support.",
    };
  }
}
