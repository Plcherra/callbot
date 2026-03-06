/**
 * Telnyx voice webhook (API-only).
 * Answers incoming calls and starts streaming.
 * Pre-fetches receptionist prompt so WebSocket handler has it instantly (avoids 1006 timeout).
 * Validates webhook signature when TELNYX_PUBLIC_KEY or TELNYX_WEBHOOK_SECRET is set.
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import { getReceptionistByPhoneNumber } from "@/app/lib/receptionistByPhone";
import { getReceptionistPrompt } from "@/app/lib/getReceptionistPrompt";
import { setPrompt } from "@/app/lib/promptCache";
import { validateTelnyxWebhook } from "@/app/lib/telnyxWebhook";
import { getTelnyxWsBase } from "@/app/lib/env";
import { log, warn, error } from "@/app/lib/logger";

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  let body: unknown;
  try {
    body = rawBody ? (JSON.parse(rawBody) as unknown) : {};
  } catch (e) {
    log("telnyx/voice", "Bad JSON:", (e as Error).message);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const publicKey = process.env.TELNYX_PUBLIC_KEY?.trim();
  const webhookSecret = process.env.TELNYX_WEBHOOK_SECRET?.trim();
  const hasValidation = !!(publicKey || webhookSecret);

  if (hasValidation) {
    const signature = req.headers.get("t-signature") ?? req.headers.get("telnyx-signature");
    const headers = headersToRecord(req.headers);
    if (
      !validateTelnyxWebhook(rawBody, signature, {
        publicKey: publicKey || undefined,
        webhookSecret: webhookSecret || undefined,
        headers,
      })
    ) {
      warn("telnyx/voice", "Webhook signature validation failed");
      return new NextResponse("Forbidden", { status: 403 });
    }
  } else {
    warn("telnyx/voice", "TELNYX_PUBLIC_KEY or TELNYX_WEBHOOK_SECRET not set - webhook not verified");
  }

  log("telnyx/voice", "Webhook POST received, event_type:", (body as { data?: { event_type?: string } })?.data?.event_type);

  const b = body as {
    data?: {
      event_type?: string;
      payload?: {
        call_control_id?: string;
        to?: string;
        from?: string;
      };
      call_control_id?: string;
    };
  };
  if (b?.data?.event_type === "call.initiated") {
    const payload = b?.data?.payload ?? {};
    const callControlId = payload?.call_control_id ?? b?.data?.call_control_id;
    const toNumber = payload?.to ?? ""; // Our DID (they called us)

    if (callControlId) {
      const supabase = createServiceRoleClient();
      let receptionist = await getReceptionistByPhoneNumber(supabase, toNumber);
      if (!receptionist) {
        const { data: fallback } = await supabase
          .from("receptionists")
          .select("id")
          .eq("status", "active")
          .limit(1)
          .maybeSingle();
        if (fallback) {
          receptionist = { id: (fallback as { id: string }).id };
          warn("telnyx/voice", "No receptionist for DID", toNumber, "- using fallback:", receptionist.id);
        }
      }
      const receptionistId = receptionist?.id ?? "";
      if (receptionist) {
        log("telnyx/voice", "Receptionist:", receptionist.id, receptionist.name ?? "");
      }

      // Pre-fetch prompt before stream_start so WebSocket handler has it instantly (no 1006)
      try {
        const { prompt, greeting } = await getReceptionistPrompt(receptionistId);
        setPrompt(callControlId, prompt, greeting);
        log("telnyx/voice", "Prompt cached for call");
      } catch (err) {
        warn("telnyx/voice", "Prompt pre-fetch failed:", (err as Error)?.message);
      }

      const apiKey = process.env.TELNYX_API_KEY;
      if (!apiKey) {
        error("telnyx/voice", "TELNYX_API_KEY not set - cannot answer call");
        return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
      }

      const wsBase = getTelnyxWsBase();
      const params = new URLSearchParams({
        call_sid: callControlId,
        direction: "inbound",
        caller_phone: payload?.from ?? "",
      });
      if (receptionistId) params.set("receptionist_id", receptionistId);
      const streamUrl = `${wsBase}/api/voice/stream?${params.toString()}`;

      const answerRes = await fetch(
        `https://api.telnyx.com/v2/calls/${encodeURIComponent(callControlId)}/actions/answer`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      if (answerRes.ok) {
        log("telnyx/voice", "Answered via API");
      } else {
        error("telnyx/voice", "Answer failed:", await answerRes.text());
      }

      // Start streaming audio to WebSocket
      const streamRes = await fetch(
        `https://api.telnyx.com/v2/calls/${encodeURIComponent(callControlId)}/actions/streaming_start`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            stream_url: streamUrl,
            stream_bidirectional_mode: "rtp",
          }),
        }
      );

      if (streamRes.ok) {
        log("telnyx/voice", "Stream started");
      } else {
        error("telnyx/voice", "Stream start failed:", await streamRes.text());
      }
    }
  }

  return NextResponse.json({ success: true });
} 