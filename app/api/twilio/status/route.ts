import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import twilio from "twilio";

/**
 * Twilio status callback webhook.
 *
 * Handles two types:
 * 1. Media Streams: StreamEvent=stream-stopped → use streamName as receptionist_id
 * 2. Call lifecycle: CallStatus=completed (Gather/Say flow) → look up receptionist by To
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const streamEvent = formData.get("StreamEvent") as string | null;
  const callSid = (formData.get("CallSid") as string | null)?.trim();
  const streamName = (formData.get("StreamName") as string | null)?.trim();
  const timestamp = (formData.get("Timestamp") as string | null)?.trim();
  const callStatus = (formData.get("CallStatus") as string | null)?.trim();
  const to = (formData.get("To") as string | null)?.trim();
  const callDuration = parseInt(
    (formData.get("CallDuration") as string | null) ?? "0",
    10
  );

  // --- Media Streams: stream-stopped ---
  if (streamEvent === "stream-stopped" && callSid && streamName) {
    return handleStreamStopped(callSid, streamName, timestamp ?? null);
  }

  // --- Call lifecycle: completed (Gather/Say flow) ---
  if (callStatus === "completed" && callSid && to && callDuration > 0) {
    return handleCallCompleted(callSid, to, callDuration);
  }

  return NextResponse.json({ received: true });
}

async function handleStreamStopped(
  callSid: string,
  streamName: string,
  timestamp: string | null
): Promise<NextResponse> {
  const receptionistId = streamName;
  const endedAt = timestamp ? new Date(timestamp) : new Date();

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    console.error("[twilio/status] Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
    return NextResponse.json({ received: true });
  }

  const client = twilio(accountSid, authToken);

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

/**
 * Handle call completion (Gather/Say flow).
 * StatusCallback must be set on the Twilio number to receive this.
 */
async function handleCallCompleted(
  callSid: string,
  to: string,
  callDurationSeconds: number
): Promise<NextResponse> {
  const supabase = createServiceRoleClient();

  let rec: { id: string } | null = null;
  const { data: byTwilio } = await supabase
    .from("receptionists")
    .select("id")
    .eq("twilio_phone_number", to)
    .eq("status", "active")
    .maybeSingle();
  if (byTwilio) rec = byTwilio;
  else {
    const { data: byInbound } = await supabase
      .from("receptionists")
      .select("id")
      .eq("inbound_phone_number", to)
      .eq("status", "active")
      .maybeSingle();
    rec = byInbound;
  }

  if (!rec) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[twilio/status] No receptionist for To:", to);
    }
    return NextResponse.json({ received: true });
  }

  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - callDurationSeconds * 1000);

  const { error } = await supabase.from("call_usage").insert({
    receptionist_id: rec.id,
    vapi_call_id: callSid,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_seconds: callDurationSeconds,
  });

  if (error) {
    if (error.code === "23505") return NextResponse.json({ received: true });
    console.error("[twilio/status] call_usage insert failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
