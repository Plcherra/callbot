/**
 * Send FCM push for incoming/ended calls.
 * Used by CDR webhook (call_ended) and called via internal API by voice backend (incoming_call).
 */

import * as admin from "firebase-admin";
import type { SupabaseClient } from "@supabase/supabase-js";

function getMessaging(): admin.messaging.Messaging | null {
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
  return admin.messaging();
}

export async function sendCallPush(
  supabase: SupabaseClient,
  userId: string,
  callSid: string,
  receptionistName: string,
  type: "incoming_call" | "call_ended"
): Promise<{ sent: number }> {
  const messaging = getMessaging();
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
      ? `${receptionistName} – Incoming call`
      : `Call with ${receptionistName} ended`;

  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: { title, body: bodyText },
    data: { type, call_sid: callSid, receptionist_name: receptionistName },
    android: {
      priority: "high",
      notification: { channelId: "echodesk_calls" },
    },
    apns: { payload: { aps: { sound: "default" } } },
  };

  const result = await messaging.sendEachForMulticast(message);
  return { sent: result.successCount };
}
