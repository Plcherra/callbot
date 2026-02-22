"use server";

import {
  provisionNumber,
  configureVoiceUrl,
  configureSmsUrl,
} from "@/app/lib/twilio";

function isPlaceholderUrl(value: string): boolean {
  return /your-app\.com|your-domain\.com/i.test(value);
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
    return {
      success: false,
      error: message.includes("No available")
        ? `No available phone numbers in area code ${areaCode}. Try a different area code.`
        : `Could not provision Twilio number: ${message}`,
    };
  }
}
