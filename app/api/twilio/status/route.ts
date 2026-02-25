import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import twilio from "twilio";
import {
  parseFormParams,
  getStringParam,
  validateTwilioRequest,
} from "@/app/lib/twilioWebhook";
import { getReceptionistByPhoneNumber } from "@/app/lib/receptionistByPhone";
import { insertCallUsage } from "@/app/lib/callUsage";

/**
 * Twilio status callback webhook.
 *
 * Handles two types:
 * 1. Media Streams: StreamEvent=stream-stopped → use streamName as receptionist_id
 * 2. Call lifecycle: CallStatus=completed (Gather/Say flow) → look up receptionist by To
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const params = parseFormParams(rawBody);
  const signature = req.headers.get("x-twilio-signature");

  if (
    !validateTwilioRequest(rawBody, signature, params, "/api/twilio/status")
  ) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const streamEvent = getStringParam(params, "StreamEvent");
  const callSid = getStringParam(params, "CallSid");
  const streamName = getStringParam(params, "StreamName");
  const timestamp = getStringParam(params, "Timestamp");
  const callStatus = getStringParam(params, "CallStatus");
  const to = getStringParam(params, "To");
  const callDuration = parseInt(getStringParam(params, "CallDuration") ?? "0", 10);

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

function parseCostCents(price: string | null | undefined): number | null {
  if (price == null || price === "") return null;
  const parsed = parseFloat(price);
  if (Number.isNaN(parsed)) return null;
  return Math.round(Math.abs(parsed) * 100);
}

function normalizeDirection(dir: string | null | undefined): string | null {
  if (!dir?.trim()) return null;
  return dir.toLowerCase().startsWith("inbound") ? "inbound" : "outbound";
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
  const supabase = createServiceRoleClient();

  const { data: receptionist } = await supabase
    .from("receptionists")
    .select("id, user_id")
    .eq("id", receptionistId)
    .single();

  let startedAt: Date;
  let costCents: number | null = null;
  let direction: string | null = null;
  try {
    const call = await client.calls(callSid).fetch();
    startedAt = call.dateCreated ?? new Date(endedAt.getTime() - 60000);
    costCents = parseCostCents((call as { price?: string }).price);
    direction = normalizeDirection((call as { direction?: string }).direction);
  } catch (err) {
    console.warn("[twilio/status] Could not fetch call:", err);
    startedAt = new Date(endedAt.getTime() - 60000);
  }

  const durationSeconds = Math.max(
    0,
    Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)
  );

  const { error } = await insertCallUsage({
    supabase,
    receptionistId,
    userId: receptionist?.user_id ?? null,
    callSid,
    startedAt,
    endedAt,
    durationSeconds,
    direction,
    costCents,
    status: "completed",
  });

  if (error) {
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
  const rec = await getReceptionistByPhoneNumber(supabase, to);

  if (!rec) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[twilio/status] No receptionist for To:", to);
    }
    return NextResponse.json({ received: true });
  }

  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - callDurationSeconds * 1000);

  let costCents: number | null = null;
  let direction: string | null = null;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (accountSid && authToken) {
    try {
      const client = twilio(accountSid, authToken);
      const call = await client.calls(callSid).fetch();
      costCents = parseCostCents((call as { price?: string }).price);
      direction = normalizeDirection((call as { direction?: string }).direction);
    } catch (err) {
      console.warn("[twilio/status] Could not fetch call for cost:", err);
    }
  }

  const { error } = await insertCallUsage({
    supabase,
    receptionistId: rec.id,
    userId: rec.user_id ?? null,
    callSid,
    startedAt,
    endedAt,
    durationSeconds: callDurationSeconds,
    direction,
    costCents,
    status: "completed",
  });

  if (error) {
    console.error("[twilio/status] call_usage insert failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
