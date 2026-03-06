/**
 * Telnyx voice webhook (API-only).
 * Answers incoming calls and starts streaming.
 * Pre-fetches receptionist prompt so WebSocket handler has it instantly (avoids 1006 timeout).
 */

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import { getReceptionistByPhoneNumber } from "@/app/lib/receptionistByPhone";
import { getReceptionistPrompt } from "@/app/lib/getReceptionistPrompt";
import { setPrompt } from "@/app/lib/promptCache";

export async function POST(req: Request) {
  console.log("Webhook POST received at", new Date().toISOString());

  let body: unknown;
  try {
    body = await req.json();
  } catch (e) {
    console.log("Bad JSON:", (e as Error).message);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log("Webhook hit:", JSON.stringify(body, null, 2));

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
          console.warn("[telnyx/voice] No receptionist for DID", toNumber, "- using fallback:", receptionist.id);
        }
      }
      const receptionistId = receptionist?.id ?? "";
      if (receptionist) {
        console.log("[telnyx/voice] Receptionist:", receptionist.id, receptionist.name ?? "");
      }

      // Pre-fetch prompt before stream_start so WebSocket handler has it instantly (no 1006)
      try {
        const { prompt, greeting } = await getReceptionistPrompt(receptionistId);
        setPrompt(callControlId, prompt, greeting);
        console.log("[telnyx/voice] Prompt cached for call");
      } catch (err) {
        console.warn("[telnyx/voice] Prompt pre-fetch failed:", (err as Error)?.message);
      }

      const apiKey = process.env.TELNYX_API_KEY;
      const base = process.env.TELNYX_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://echodesk.us";
      const wsBase = base.replace(/^http/, "ws").replace(/\/$/, "");
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
        console.log("Answered via API");
      } else {
        console.log("Answer failed:", await answerRes.text());
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
        console.log("Stream started");
      } else {
        console.log("Stream start failed:", await streamRes.text());
      }
    }
  }

  return NextResponse.json({ success: true });
} 