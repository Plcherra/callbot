import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/app/lib/supabase/server";

type VapiWebhookMessage = {
  type: string;
  call?: {
    id?: string;
    assistantId?: string;
    phoneNumberId?: string;
    startedAt?: string;
    endedAt?: string;
    [key: string]: unknown;
  };
  status?: string;
  endedReason?: string;
  artifact?: { transcript?: string; [key: string]: unknown };
  [key: string]: unknown;
};

type VapiWebhookBody = {
  message?: VapiWebhookMessage;
};

export async function POST(req: NextRequest) {
  let body: VapiWebhookBody;
  try {
    body = (await req.json()) as VapiWebhookBody;
  } catch {
    console.error("[Vapi webhook] Invalid JSON body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = body?.message;
  if (!message) {
    return NextResponse.json({ received: true });
  }

  const isEndOfCall =
    message.type === "end-of-call-report" ||
    (message.type === "status-update" && message.status === "ended");

  if (!isEndOfCall) {
    return NextResponse.json({ received: true });
  }

  const call = message.call;
  if (!call) {
    console.error("[Vapi webhook] end-of-call missing message.call", {
      type: message.type,
      requestId: req.headers.get("x-request-id"),
    });
    return NextResponse.json({ received: true });
  }

  const assistantId =
    (typeof call.assistantId === "string" ? call.assistantId : undefined) ??
    (typeof (call as { assistant_id?: string }).assistant_id === "string"
      ? (call as { assistant_id: string }).assistant_id
      : undefined);
  const phoneNumberId =
    (typeof call.phoneNumberId === "string" ? call.phoneNumberId : undefined) ??
    (typeof (call as { phone_number_id?: string }).phone_number_id === "string"
      ? (call as { phone_number_id: string }).phone_number_id
      : undefined);
  const vapiCallId = typeof call.id === "string" ? call.id : undefined;

  if (!assistantId && !phoneNumberId) {
    console.error("[Vapi webhook] end-of-call missing assistantId and phoneNumberId", {
      vapiCallId,
      requestId: req.headers.get("x-request-id"),
    });
    return NextResponse.json({ received: true });
  }

  const supabase = createServiceRoleClient();

  let receptionistId: string | null = null;
  if (assistantId) {
    const { data: byAssistant } = await supabase
      .from("receptionists")
      .select("id")
      .eq("vapi_assistant_id", assistantId)
      .maybeSingle();
    receptionistId = byAssistant?.id ?? null;
  }
  if (!receptionistId && phoneNumberId) {
    const { data: byPhone } = await supabase
      .from("receptionists")
      .select("id")
      .eq("vapi_phone_number_id", phoneNumberId)
      .maybeSingle();
    receptionistId = byPhone?.id ?? null;
  }

  if (!receptionistId) {
    console.error("[Vapi webhook] receptionist not found for call", {
      assistantId,
      phoneNumberId,
      vapiCallId,
      requestId: req.headers.get("x-request-id"),
    });
    return NextResponse.json({ received: true });
  }

  const startedAtRaw = call.startedAt;
  const endedAtRaw = call.endedAt;
  const startedAt = typeof startedAtRaw === "string" ? new Date(startedAtRaw) : null;
  const endedAt = typeof endedAtRaw === "string" ? new Date(endedAtRaw) : null;

  let started_at: Date;
  let ended_at: Date;
  let duration_seconds: number;

  if (startedAt && endedAt && !Number.isNaN(startedAt.getTime()) && !Number.isNaN(endedAt.getTime())) {
    started_at = startedAt;
    ended_at = endedAt;
    duration_seconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  } else {
    ended_at = new Date();
    duration_seconds = 0;
    started_at = new Date(ended_at.getTime());
  }

  const row = {
    receptionist_id: receptionistId,
    vapi_call_id: vapiCallId ?? null,
    started_at: started_at.toISOString(),
    ended_at: ended_at.toISOString(),
    duration_seconds,
  };

  const { error } = await supabase.from("call_usage").insert(row);

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ received: true });
    }
    console.error("[Vapi webhook] call_usage insert failed", {
      error: error.message,
      receptionistId,
      vapiCallId,
      requestId: req.headers.get("x-request-id"),
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
