/**
 * Telnyx CDR (Call Detail Record) webhook.
 * Receives call ended events, inserts into call_usage.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import { validateTelnyxWebhook, parseTelnyxEvent } from "@/app/lib/telnyxWebhook";
import { getReceptionistByPhoneNumber } from "@/app/lib/receptionistByPhone";
import { insertCallUsage } from "@/app/lib/callUsage";
import { sendCallPush } from "@/app/lib/sendCallPush";
import { warn } from "@/app/lib/logger";

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function roundToSixSecondIncrements(seconds: number): number {
  const increments = Math.ceil(seconds / 6);
  return (increments * 6) / 60;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("t-signature") ?? req.headers.get("telnyx-signature");
  const publicKey = process.env.TELNYX_PUBLIC_KEY?.trim();
  const webhookSecret = process.env.TELNYX_WEBHOOK_SECRET?.trim();
  const hasValidation = !!(publicKey || webhookSecret);

  if (hasValidation) {
    const headers = headersToRecord(req.headers);
    if (
      !validateTelnyxWebhook(rawBody, signature, {
        publicKey: publicKey || undefined,
        webhookSecret: webhookSecret || undefined,
        headers,
      })
    ) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  } else {
    warn("telnyx/cdr", "TELNYX_PUBLIC_KEY or TELNYX_WEBHOOK_SECRET not set - webhook not verified");
  }

  const event = parseTelnyxEvent(rawBody);
  if (!event) return NextResponse.json({ received: true });

  const eventType = event.event_type;
  if (
    eventType !== "call.call-ended" &&
    eventType !== "call.hangup" &&
    eventType !== "call.recording.saved"
  ) {
    return NextResponse.json({ received: true });
  }

  const data = event.data as {
    payload?: {
      call_control_id?: string;
      call_leg_id?: string;
      call_session_id?: string;
      to?: string;
      from?: string;
      direction?: string;
      hangup_cause?: string;
      started_at?: string;
      ended_at?: string;
      duration_millis?: number;
    };
  };
  const payload = data?.payload;
  if (!payload) return NextResponse.json({ received: true });

  const callControlId =
    payload.call_control_id ?? payload.call_leg_id ?? payload.call_session_id;
  const to = payload.to;
  const from = payload.from;
  const direction = payload.direction?.toLowerCase().startsWith("inbound")
    ? "inbound"
    : "outbound";

  // Inbound: to = our DID. Outbound: from = our DID.
  const ourDid = direction === "inbound" ? to : from;
  if (!callControlId || !ourDid) {
    return NextResponse.json({ received: true });
  }

  const supabase = createServiceRoleClient();
  const receptionist = await getReceptionistByPhoneNumber(supabase, ourDid);

  if (!receptionist) {
    return NextResponse.json({ received: true });
  }

  const durationMs = payload.duration_millis ?? 0;
  const durationSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const billedMinutes = roundToSixSecondIncrements(durationSeconds);

  const endedAt = payload.ended_at
    ? new Date(payload.ended_at)
    : new Date();
  const startedAt = payload.started_at
    ? new Date(payload.started_at)
    : new Date(endedAt.getTime() - durationMs);

  const { error, inserted } = await insertCallUsage({
    supabase,
    receptionistId: receptionist.id,
    userId: receptionist.user_id ?? undefined,
    callSid: callControlId,
    startedAt,
    endedAt,
    durationSeconds,
    direction,
    status: "completed",
    telnyxCallControlId: callControlId,
    billedMinutes,
    recordingConsentPlayed: true,
  });

  if (error) {
    console.error("[telnyx/cdr] insertCallUsage failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Increment user_plans usage for quota tracking (only when we inserted a new row)
  if (
    inserted &&
    receptionist.user_id &&
    direction &&
    billedMinutes > 0
  ) {
    await supabase.rpc("increment_user_plan_usage", {
      p_user_id: receptionist.user_id,
      p_direction: direction,
      p_minutes: billedMinutes,
    });
  }

  // Send call_ended push to user's devices so Flutter can dismiss call UI
  if (receptionist.user_id && (eventType === "call.call-ended" || eventType === "call.hangup")) {
    sendCallPush(
      supabase,
      receptionist.user_id,
      callControlId,
      receptionist.name ?? "Receptionist",
      "call_ended"
    ).catch((e) => console.error("[telnyx/cdr] call_ended push failed:", e));
  }

  return NextResponse.json({ received: true });
}
