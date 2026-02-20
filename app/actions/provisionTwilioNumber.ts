"use server";

import { provisionNumber, configureVoiceUrl } from "@/app/lib/twilio";

/**
 * Provisions a Twilio phone number in the given area code and configures
 * the voice webhook URL. Returns the SID and E.164 number.
 * Caller is responsible for storing these on the receptionist.
 */
export async function provisionTwilioNumber(areaCode: string): Promise<
  | { success: true; sid: string; phoneNumber: string }
  | { success: false; error: string }
> {
  const webhookBase = process.env.TWILIO_WEBHOOK_BASE_URL;
  if (!webhookBase) {
    return {
      success: false,
      error: "TWILIO_WEBHOOK_BASE_URL must be set for Twilio provisioning.",
    };
  }

  try {
    const { sid, phoneNumber } = await provisionNumber(areaCode);
    const webhookUrl = `${webhookBase.replace(/\/$/, "")}/api/twilio/voice`;
    await configureVoiceUrl(sid, webhookUrl);
    return { success: true, sid, phoneNumber };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[provisionTwilioNumber] Error:", err);
    return {
      success: false,
      error: message.includes("No available")
        ? `No available phone numbers in area code ${areaCode}. Try a different area code.`
        : `Could not provision Twilio number: ${message}`,
    };
  }
}
