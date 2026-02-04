"use server";

import { createClient } from "@/app/lib/supabase/server";
import { createAssistant } from "@/app/lib/vapi";

export async function activateBot(): Promise<
  { success: true; testNumber?: string } | { success: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("subscription_status, phone, calendar_id, vapi_assistant_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { success: false, error: "Could not load your profile." };
  }
  if (profile.subscription_status !== "active") {
    return { success: false, error: "Active subscription required." };
  }
  if (!profile.phone?.trim()) {
    return { success: false, error: "Please add your business phone number." };
  }
  if (!profile.calendar_id?.trim()) {
    return { success: false, error: "Please connect Google Calendar first." };
  }
  if (profile.vapi_assistant_id) {
    return {
      success: true,
      testNumber: process.env.VAPI_TEST_CALL_NUMBER,
    };
  }

  const systemPrompt = `You are an AI receptionist for a small business (salon, barbershop, spa, or handyman). You answer calls professionally and help callers book appointments. The business phone number is ${profile.phone}. You have access to the business Google Calendar (calendar ID: ${profile.calendar_id}) to check availability and create events. Be friendly, concise, and confirm the appointment details before ending the call.`;

  try {
    const assistant = await createAssistant({
      name: "Receptionist Assistant",
      model: { provider: "openai", model: "gpt-4o-mini" },
      voice: { provider: "11labs", voiceId: "21m00Tcm4TlvDq8ikWAM" },
      firstMessage:
        "Hello! Thanks for calling. I'm your AI receptionist. How can I help you today?",
      systemPrompt,
    });

    const { error: updateError } = await supabase
      .from("users")
      .update({
        vapi_assistant_id: assistant.id,
        bot_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      return { success: false, error: "Failed to save assistant." };
    }

    return {
      success: true,
      testNumber: process.env.VAPI_TEST_CALL_NUMBER,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Vapi API error";
    return { success: false, error: message };
  }
}
