"use server";

import { createClient } from "@/app/lib/supabase/server";
import {
  createAssistant,
  createPhoneNumber,
  updatePhoneNumber,
  waitForPhoneNumberProvisioned,
  deleteAssistant,
  deletePhoneNumber,
} from "@/app/lib/vapi";
import { buildReceptionistPrompt } from "@/app/lib/buildReceptionistPrompt";

export async function createReceptionist(data: {
  name: string;
  phone_number: string;
  calendar_id: string;
  country: string;
}): Promise<{ success: true; id?: string } | { success: false; error: string }> {
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
      error: "Please connect Google Calendar first (Step 1). Go to Settings → Integrations or complete the step above.",
    };
  }

  const name = data.name?.trim();
  const phone = data.phone_number?.trim().replace(/\D/g, "");
  const calendarId = data.calendar_id?.trim();
  const country = data.country?.trim().toUpperCase() || "US";

  if (!name) return { success: false, error: "Name is required." };
  if (!phone || phone.length < 10) return { success: false, error: "Valid phone number is required." };
  if (!calendarId) return { success: false, error: "Calendar ID is required." };

  const e164 =
    phone.length === 10 ? `+1${phone}` : phone.startsWith("1") ? `+${phone}` : `+${phone}`;

  // Derive area code from phone for US/CA: first 3 digits after country code
  const localDigits =
    phone.startsWith("1") && phone.length === 11 ? phone.slice(1) : phone.length === 10 ? phone : "";
  const areaCode = localDigits.length >= 3 ? localDigits.slice(0, 3) : "";

  if (!areaCode || areaCode.length < 3) {
    return { success: false, error: "Could not derive area code from phone number. Use a valid 10-digit US/CA number." };
  }

  const systemPrompt = buildReceptionistPrompt({
    name,
    phoneNumber: e164,
    calendarId,
    staff: [],
    services: [],
    locations: [],
    promos: [],
    reminderRules: [],
    paymentSettings: undefined,
  });

  let assistantId: string | null = null;
  let phoneNumberId: string | null = null;

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/vapi/webhook`;

    const checkToolId = process.env.VAPI_TOOL_CHECK_AVAILABILITY_ID;
    const createToolId = process.env.VAPI_TOOL_CREATE_EVENT_ID;
    if (!checkToolId || !createToolId) {
      return {
        success: false,
        error:
          "VAPI_TOOL_CHECK_AVAILABILITY_ID and VAPI_TOOL_CREATE_EVENT_ID must be set in environment.",
      };
    }
    const toolIds = [checkToolId, createToolId];

    const assistant = await createAssistant({
      name: name,
      model: {
        provider: "openai",
        model: "gpt-4o-mini",
        toolIds,
      },
      voice: { provider: "11labs", voiceId: "21m00Tcm4TlvDq8ikWAM" },
      firstMessage: `Hello! Thanks for calling. I'm ${name}, your AI receptionist. How can I help you today?`,
      systemPrompt,
      serverUrl: webhookUrl,
    });
    assistantId = assistant.id;

    const phoneNumber = await createPhoneNumber({
      areaCode,
    });
    phoneNumberId = phoneNumber.id;

    const provisioned = await waitForPhoneNumberProvisioned(phoneNumber.id);
    if (!provisioned.number) {
      if (phoneNumberId) {
        try {
          await deletePhoneNumber(phoneNumberId);
        } catch {
          /* best-effort */
        }
      }
      if (assistantId) {
        try {
          await deleteAssistant(assistantId);
        } catch {
          /* best-effort */
        }
      }
      return {
        success: false,
        error:
          "Phone number provisioning is taking longer than expected. Please try again in a few minutes.",
      };
    }

    try {
      await updatePhoneNumber(phoneNumber.id, assistant.id);
    } catch {
      try {
        await deletePhoneNumber(phoneNumberId!);
      } catch {
        /* best-effort */
      }
      try {
        await deleteAssistant(assistantId!);
      } catch {
        /* best-effort */
      }
      return {
        success: false,
        error: "Failed to attach phone number to assistant. Please try again.",
      };
    }

    const inboundNumber = provisioned.number;

    const { data: row, error } = await supabase
      .from("receptionists")
      .insert({
        user_id: user.id,
        name,
        phone_number: e164,
        vapi_assistant_id: assistant.id,
        vapi_phone_number_id: phoneNumber.id,
        inbound_phone_number: inboundNumber ?? null,
        calendar_id: calendarId,
        status: "active",
      })
      .select("id")
      .single();

    if (error) {
      if (phoneNumberId) {
        try {
          await deletePhoneNumber(phoneNumberId);
        } catch {
          // best-effort cleanup
        }
      }
      if (assistantId) {
        try {
          await deleteAssistant(assistantId);
        } catch {
          // best-effort cleanup
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
      .eq("id", user.id)
      .is("onboarding_completed_at", null);

    return { success: true, id: row?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[createReceptionist] Error:", err);
    if (phoneNumberId) {
      try {
        await deletePhoneNumber(phoneNumberId);
      } catch {
        // best-effort cleanup
      }
    }
    if (assistantId) {
      try {
        await deleteAssistant(assistantId);
      } catch {
        // best-effort cleanup
      }
    }
    if (
      typeof message === "string" &&
      (message.includes("10") || message.toLowerCase().includes("limit"))
    ) {
      return {
        success: false,
        error:
          "Phone number limit reached (10 free numbers per account). Please contact support to add more numbers.",
      };
    }
    // Surface Vapi API errors (auth, rate limits, etc.) and dev errors for debugging
    const isVapiError = typeof message === "string" && message.includes("Vapi API error");
    const userMessage =
      process.env.NODE_ENV === "development" && message
        ? `Could not activate your AI receptionist: ${message}`
        : isVapiError && message
          ? message
          : "Could not activate your AI receptionist. Please try again or contact support.";
    return { success: false, error: userMessage };
  }
}
