"use server";

import {
  provisionNumber,
  configureVoiceUrl,
  releaseNumber,
} from "@/app/lib/telnyx";
import { createClient } from "@/app/lib/supabase/server";
import { isPlaceholderUrl } from "@/app/lib/urlUtils";

/**
 * Configure voice webhook on an existing Telnyx number (bring-your-own).
 */
export async function configureExistingTelnyxNumber(
  phoneNumberId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated." };
  }

  const webhookBase =
    process.env.TELNYX_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!webhookBase || isPlaceholderUrl(webhookBase)) {
    return {
      success: false,
      error: "TELNYX_WEBHOOK_BASE_URL must be set for Telnyx configuration.",
    };
  }
  try {
    const base = webhookBase.replace(/\/$/, "");
    const voiceUrl = `${base}/api/telnyx/voice`;
    await configureVoiceUrl(phoneNumberId, voiceUrl);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[configureExistingTelnyxNumber] Error:", err);
    return { success: false, error: message };
  }
}

/**
 * Provision a Telnyx phone number in the given area code and configure voice webhook.
 */
export async function provisionTelnyxNumber(areaCode: string): Promise<
  | { success: true; id: string; phoneNumber: string }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated." };
  }

  const webhookBase =
    process.env.TELNYX_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!webhookBase) {
    return {
      success: false,
      error: "TELNYX_WEBHOOK_BASE_URL must be set for Telnyx provisioning.",
    };
  }
  if (isPlaceholderUrl(webhookBase)) {
    return {
      success: false,
      error:
        "TELNYX_WEBHOOK_BASE_URL is still set to a placeholder. Set it to your public app URL before provisioning.",
    };
  }

  try {
    const { id, phoneNumber } = await provisionNumber(areaCode);
    const base = webhookBase.replace(/\/$/, "");
    const voiceUrl = `${base}/api/telnyx/voice`;
    await configureVoiceUrl(id, voiceUrl);
    return { success: true, id, phoneNumber };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[provisionTelnyxNumber] Error:", err);
    if (message.includes("No available") || message.includes("No numbers")) {
      const suggestions = ["212", "310", "415", "617", "646", "202", "305", "702"]
        .filter((ac) => ac !== areaCode)
        .slice(0, 3)
        .join(", ");
      return {
        success: false,
        error: `No numbers available in area code ${areaCode}. Try ${suggestions || "212, 310, or 415"} — or bring your own number.`,
      };
    }
    return { success: false, error: `Could not provision number: ${message}` };
  }
}

export { releaseNumber };
