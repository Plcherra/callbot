"use server";

import { createClient } from "@/app/lib/supabase/server";
import {
  createAssistant,
  createPhoneNumber,
  updatePhoneNumber,
  deleteAssistant,
  deletePhoneNumber,
  createGoogleCalendarTools,
} from "@/app/lib/vapi";
import { buildReceptionistPrompt } from "@/app/lib/buildReceptionistPrompt";

export async function createReceptionist(data: {
  name: string;
  phone_number: string;
  calendar_id: string;
  area_code?: string;
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
    .select("subscription_status")
    .eq("id", user.id)
    .single();

  if (profile?.subscription_status !== "active") {
    return { success: false, error: "Active subscription required." };
  }

  const name = data.name?.trim();
  const phone = data.phone_number?.trim().replace(/\D/g, "");
  const calendarId = data.calendar_id?.trim();

  if (!name) return { success: false, error: "Name is required." };
  if (!phone || phone.length < 10) return { success: false, error: "Valid phone number is required." };
  if (!calendarId) return { success: false, error: "Calendar ID is required." };

  const e164 =
    phone.length === 10 ? `+1${phone}` : phone.startsWith("1") ? `+${phone}` : `+${phone}`;

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

    let toolIds: string[];
    try {
      toolIds = await createGoogleCalendarTools(calendarId);
    } catch {
      return {
        success: false,
        error:
          "Could not create calendar tools. Connect Google Calendar in Vapi Dashboard (Integrations → Tools → Google Calendar), then try again.",
      };
    }

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
      areaCode: data.area_code?.trim() || undefined,
    });
    phoneNumberId = phoneNumber.id;

    await updatePhoneNumber(phoneNumber.id, assistant.id);

    const inboundNumber =
      typeof phoneNumber.number === "string" ? phoneNumber.number : undefined;

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
    const message = err instanceof Error ? err.message : "";
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
    return {
      success: false,
      error:
        "Could not activate your AI receptionist. Please try again or contact support.",
    };
  }
}
