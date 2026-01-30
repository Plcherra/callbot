"use server";

import { createClient } from "@/app/lib/supabase/server";
import { createAssistant } from "@/app/lib/vapi";

const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;

export async function createReceptionist(data: {
  name: string;
  phone_number: string;
  calendar_id: string;
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

  const systemPrompt = `You are an AI receptionist named ${name}. You answer calls professionally and help callers book appointments. The business phone number is ${e164}. You have access to the business Google Calendar (calendar ID: ${calendarId}) to check availability and create events. Be friendly, concise, and confirm the appointment details before ending the call.`;

  try {
    const assistant = await createAssistant({
      name: name,
      model: { provider: "openai", model: "gpt-4o-mini" },
      voice: { provider: "11labs", voiceId: "21m00Tcm4TlvDq8ikWAM" },
      firstMessage: `Hello! Thanks for calling. I'm ${name}, your AI receptionist. How can I help you today?`,
      systemPrompt,
      ...(VAPI_PHONE_NUMBER_ID && { phoneNumberId: VAPI_PHONE_NUMBER_ID }),
    });

    const { data: row, error } = await supabase
      .from("receptionists")
      .insert({
        user_id: user.id,
        name,
        phone_number: e164,
        vapi_assistant_id: assistant.id,
        calendar_id: calendarId,
        status: "active",
      })
      .select("id")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: row?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Vapi API error";
    return { success: false, error: message };
  }
}
