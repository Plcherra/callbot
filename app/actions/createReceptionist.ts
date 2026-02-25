"use server";
// Vapi path fully removed – Twilio only as of 2025-02-24

import { createClient } from "@/app/lib/supabase/server";
import {
  provisionTwilioNumber,
  configureExistingTwilioNumber,
} from "@/app/actions/provisionTwilioNumber";
import { releaseNumber } from "@/app/lib/twilio";
import { isPlaceholderUrl } from "@/app/lib/urlUtils";
import { normalizeToE164 } from "@/app/lib/phone";

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
  data: CreateReceptionistData
): Promise<
  | { success: true; id?: string; phoneNumber?: string }
  | { success: false; error: string }
> {
  const supabase = await createClient();
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

  const webhookBase =
    process.env.TWILIO_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!webhookBase || isPlaceholderUrl(webhookBase)) {
    return {
      success: false,
      error:
        "TWILIO_WEBHOOK_BASE_URL must be set to your public app URL before provisioning.",
    };
  }
  const voiceServerUrl = process.env.VOICE_SERVER_WS_URL;
  if (!voiceServerUrl || isPlaceholderUrl(voiceServerUrl)) {
    return {
      success: false,
      error:
        "VOICE_SERVER_WS_URL is not configured. Set it to your public wss:// voice server URL.",
    };
  }

  let inboundNumber: string;
  let twilioSid: string | null = null;
  let twilioPhoneNumber: string | null = null;

  if (data.phone_strategy === "new") {
    const areaCode =
      data.area_code === "other" || !data.area_code ? "212" : data.area_code;
    const provisionResult = await provisionTwilioNumber(areaCode);
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
    twilioSid = provisionResult.sid;
    twilioPhoneNumber = provisionResult.phoneNumber;
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
      const configResult = await configureExistingTwilioNumber(
        data.provider_sid.trim()
      );
      if (!configResult.success) {
        return {
          success: false,
          error: `Could not configure Twilio number: ${configResult.error}`,
        };
      }
      twilioSid = data.provider_sid.trim();
      twilioPhoneNumber = ownPhone;
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
        twilio_phone_number_sid: twilioSid,
        twilio_phone_number: twilioPhoneNumber,
        calendar_id: calendarId,
        status: "active",
        extra_instructions: extraInstructions,
      })
      .select("id")
      .single();

    if (error) {
      if (data.phone_strategy === "new" && twilioSid) {
        try {
          await releaseNumber(twilioSid);
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
    if (data.phone_strategy === "new" && twilioSid) {
      try {
        await releaseNumber(twilioSid);
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

  const webhookBase =
    process.env.TWILIO_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!webhookBase || isPlaceholderUrl(webhookBase)) {
    return {
      success: false,
      error:
        "TWILIO_WEBHOOK_BASE_URL must be set to your public app URL before provisioning a Twilio number.",
    };
  }
  const voiceServerUrl = process.env.VOICE_SERVER_WS_URL;
  if (!voiceServerUrl || isPlaceholderUrl(voiceServerUrl)) {
    return {
      success: false,
      error:
        "VOICE_SERVER_WS_URL is not configured. Set it to your public wss:// voice server URL before activating Twilio voice.",
    };
  }

  let twilioSid: string | null = null;
  try {
    const provisionResult = await provisionTwilioNumber(areaCode);
    if (!provisionResult.success) {
      return { success: false, error: provisionResult.error };
    }
    twilioSid = provisionResult.sid;
    const inboundNumber = provisionResult.phoneNumber;

    const { data: row, error } = await supabase
      .from("receptionists")
      .insert({
        user_id: userId,
        name,
        phone_number: e164,
        twilio_phone_number_sid: twilioSid,
        twilio_phone_number: inboundNumber,
        inbound_phone_number: inboundNumber,
        calendar_id: calendarId,
        status: "active",
      })
      .select("id")
      .single();

    if (error) {
      if (twilioSid) {
        try {
          await releaseNumber(twilioSid);
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
    console.error("[createReceptionist] Twilio Error:", err);
    if (twilioSid) {
      try {
        await releaseNumber(twilioSid);
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
