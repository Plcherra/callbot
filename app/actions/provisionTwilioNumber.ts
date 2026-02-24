"use server";

import {
  provisionNumber,
  configureVoiceUrl,
  configureSmsUrl,
} from "@/app/lib/twilio";
import { createClient } from "@/app/lib/supabase/server";
import { isPlaceholderUrl } from "@/app/lib/urlUtils";

/**
 * Configures voice and SMS webhooks on an existing Twilio number (bring-your-own).
 * Use when the user provides a Twilio SID for a number they already own.
 */
export async function configureExistingTwilioNumber(
  sid: string
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated." };
  }

  const webhookBase =
    process.env.TWILIO_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!webhookBase || isPlaceholderUrl(webhookBase)) {
    return {
      success: false,
      error: "TWILIO_WEBHOOK_BASE_URL must be set for Twilio configuration.",
    };
  }
  try {
    const base = webhookBase.replace(/\/$/, "");
    const voiceUrl = `${base}/api/twilio/voice`;
    const statusCallbackUrl = `${base}/api/twilio/status`;
    await configureVoiceUrl(sid, voiceUrl, { statusCallbackUrl });
    await configureSmsUrl(sid, `${base}/api/twilio/sms`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[configureExistingTwilioNumber] Error:", err);
    return { success: false, error: message };
  }
}

/**
 * Provisions a Twilio phone number in the given area code and configures
 * the voice webhook URL. Returns the SID and E.164 number.
 * Caller is responsible for storing these on the receptionist.
 */
export async function provisionTwilioNumber(areaCode: string): Promise<
  | { success: true; sid: string; phoneNumber: string }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated." };
  }

  const webhookBase =
    process.env.TWILIO_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!webhookBase) {
    return {
      success: false,
      error: "TWILIO_WEBHOOK_BASE_URL must be set for Twilio provisioning.",
    };
  }
  if (isPlaceholderUrl(webhookBase)) {
    return {
      success: false,
      error:
        "TWILIO_WEBHOOK_BASE_URL is still set to a placeholder. Set it to your public app URL before provisioning a Twilio number.",
    };
  }

  try {
    const { sid, phoneNumber } = await provisionNumber(areaCode);
    const base = webhookBase.replace(/\/$/, "");
    const voiceUrl = `${base}/api/twilio/voice`;
    const statusCallbackUrl = `${base}/api/twilio/status`;
    await configureVoiceUrl(sid, voiceUrl, { statusCallbackUrl });
    await configureSmsUrl(sid, `${base}/api/twilio/sms`);
    return { success: true, sid, phoneNumber };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[provisionTwilioNumber] Error:", err);
    if (message.includes("No available")) {
      const suggestions = ["212", "310", "415", "617", "646", "202", "305", "702"]
        .filter((ac) => ac !== areaCode)
        .slice(0, 3)
        .join(", ");
      return {
        success: false,
        error: `No numbers available in area code ${areaCode}. Try ${suggestions || "212, 310, or 415"} — or bring your own number.`,
      };
    }
    return {
      success: false,
      error: `Could not provision number: ${message}`,
    };
  }
}
