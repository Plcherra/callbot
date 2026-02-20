import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import twilio from "twilio";

/**
 * Twilio Stream status callback (stream-started, stream-stopped).
 * On stream-stopped, fetches call details and inserts into call_usage.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const streamEvent = formData.get("StreamEvent") as string | null;
  const callSid = formData.get("CallSid") as string | null;
  const streamName = formData.get("StreamName") as string | null;
  const timestamp = formData.get("Timestamp") as string | null;

  if (streamEvent !== "stream-stopped" || !callSid || !streamName) {
    return NextResponse.json({ received: true });
  }

  const receptionistId = streamName;
  const endedAt = timestamp ? new Date(timestamp) : new Date();

  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );

  let startedAt: Date;
  try {
    const call = await client.calls(callSid).fetch();
    startedAt = call.dateCreated ?? new Date(endedAt.getTime() - 60000);
  } catch (err) {
    console.warn("[twilio/status] Could not fetch call:", err);
    startedAt = new Date(endedAt.getTime() - 60000);
  }

  const durationSeconds = Math.max(
    0,
    Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)
  );

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("call_usage").insert({
    receptionist_id: receptionistId,
    vapi_call_id: callSid,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_seconds: durationSeconds,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ received: true });
    }
    console.error("[twilio/status] call_usage insert failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
