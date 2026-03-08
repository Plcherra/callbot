/**
 * Internal API: Send FCM push notification for incoming/ended calls.
 * Called by the voice backend (Python) when call.initiated fires.
 * Protected by x-internal-api-key header.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import { sendCallPush } from "@/app/lib/sendCallPush";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-internal-api-key")?.trim();
  const expected = process.env.INTERNAL_API_KEY?.trim();
  if (!expected || apiKey !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const userId = body.user_id as string | undefined;
  const callSid = body.call_sid as string | undefined;
  const receptionistName = (body.receptionist_name as string) ?? "Receptionist";
  const receptionistId = (body.receptionist_id as string) ?? "";
  const caller = (body.caller as string) ?? "";
  const type = body.type as string;

  if (!userId?.trim() || !callSid?.trim()) {
    return NextResponse.json(
      { error: "user_id and call_sid required" },
      { status: 400 }
    );
  }

  if (type !== "incoming_call" && type !== "call_ended") {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();
    const { sent } = await sendCallPush(
      supabase,
      userId,
      callSid,
      receptionistName,
      type as "incoming_call" | "call_ended",
      { caller, receptionistId }
    );
    return NextResponse.json({ sent });
  } catch (err) {
    console.error("[send-call-push]", err);
    return NextResponse.json(
      { error: "FCM send failed" },
      { status: 500 }
    );
  }
}
