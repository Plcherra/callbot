/**
 * Send FCM push for incoming/ended calls.
 * Used by CDR webhook (call_ended) and called via internal API by voice backend (incoming_call).
 */

import * as admin from "firebase-admin";
import { getMessaging } from "firebase-admin/messaging";
import type { MulticastMessage, BatchResponse } from "firebase-admin/messaging";
import type { SupabaseClient } from "@supabase/supabase-js";

function getMessagingOrNull(): ReturnType<typeof getMessaging> | null {
  if (admin.apps.length === 0) {
    const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
    if (!key) return null;
    try {
      const cred = JSON.parse(key);
      admin.initializeApp({ credential: admin.credential.cert(cred) });
    } catch {
      return null;
    }
  }
  return getMessaging();
}

export type SendCallPushOptions = {
  caller?: string;
  receptionistId?: string;
};

export async function sendCallPush(
  supabase: SupabaseClient,
  userId: string,
  callSid: string,
  receptionistName: string,
  type: "incoming_call" | "call_ended",
  options?: SendCallPushOptions
): Promise<{ sent: number }> {
  const messaging = getMessagingOrNull();
  if (!messaging) return { sent: 0 };

  const { data: rows } = await supabase
    .from("user_push_tokens")
    .select("token")
    .eq("user_id", userId);

  const tokens = (rows ?? []).map((r) => r.token).filter(Boolean);
  if (tokens.length === 0) return { sent: 0 };

  const title = type === "incoming_call" ? "Incoming call" : "Call ended";
  const bodyText =
    type === "incoming_call"
      ? `${receptionistName} – Call from ${options?.caller ?? "Unknown"}`
      : `Call with ${receptionistName} ended`;

  const data: Record<string, string> = {
    type,
    call_sid: callSid,
    receptionist_name: receptionistName,
    receptionist_id: options?.receptionistId ?? "",
    caller: options?.caller ?? "",
  };

  const message: MulticastMessage = {
    tokens,
    notification: { title, body: bodyText },
    data,
    android: {
      priority: "high",
      notification: { channelId: "echodesk_calls" },
    },
    apns: { payload: { aps: { sound: type === "incoming_call" ? "default" : undefined } } },
  };

  const result: BatchResponse = await messaging.sendEachForMulticast(message);
  return { sent: result.successCount };
}
