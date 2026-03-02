/**
 * Telnyx voice webhook.
 * Inbound: call.initiated → answer + stream to WebSocket.
 * Outbound: call.answered → stream to WebSocket (we originated the call).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import { validateTelnyxWebhook, parseTelnyxEvent } from "@/app/lib/telnyxWebhook";
import { getReceptionistByPhoneNumber } from "@/app/lib/receptionistByPhone";
import { isPlaceholderUrl } from "@/app/lib/urlUtils";

const TELNYX_API = "https://api.telnyx.com/v2";

async function streamStart(callControlId: string, streamUrl: string): Promise<void> {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) throw new Error("TELNYX_API_KEY not set");
  const res = await fetch(
    `${TELNYX_API}/call_control/${callControlId}/actions/stream_start`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ stream_url: streamUrl }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telnyx stream_start failed: ${err}`);
  }
}

async function answerAndStream(
  callControlId: string,
  streamUrl: string
): Promise<void> {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) throw new Error("TELNYX_API_KEY not set");

  const answerRes = await fetch(
    `${TELNYX_API}/call_control/${callControlId}/actions/answer`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }
  );
  if (!answerRes.ok) {
    const err = await answerRes.text();
    throw new Error(`Telnyx answer failed: ${err}`);
  }

  await streamStart(callControlId, streamUrl);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("t-signature") ?? req.headers.get("telnyx-signature");
  const publicKey = process.env.TELNYX_PUBLIC_KEY;
  const webhookSecret = process.env.TELNYX_WEBHOOK_SECRET;

  if (
    !validateTelnyxWebhook(rawBody, signature, {
      publicKey: publicKey ?? undefined,
      webhookSecret: webhookSecret ?? undefined,
    })
  ) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const event = parseTelnyxEvent(rawBody);
  if (!event) return NextResponse.json({ received: true });

  const eventType = event.event_type;
  if (eventType !== "call.initiated" && eventType !== "call.answered") {
    return NextResponse.json({ received: true });
  }

  const data = event.data as {
    payload?: {
      call_control_id?: string;
      call_leg_id?: string;
      to?: string;
      from?: string;
      direction?: string;
    };
  };
  const payload = data?.payload;
  const callControlId = payload?.call_control_id ?? payload?.call_leg_id;
  const to = payload?.to;
  const from = payload?.from;
  const direction = (payload?.direction ?? "").toLowerCase();

  if (!callControlId) {
    console.error("[telnyx/voice] Missing call_control_id");
    return NextResponse.json({ error: "Missing payload" }, { status: 400 });
  }

  // Inbound: call.initiated, to = our DID. Outbound: call.answered, from = our DID.
  const ourDid = eventType === "call.initiated" ? to : from;
  if (!ourDid) {
    console.error("[telnyx/voice] Missing to/from");
    return NextResponse.json({ error: "Missing payload" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const receptionist = await getReceptionistByPhoneNumber(supabase, ourDid);

  if (!receptionist) {
    console.warn("[telnyx/voice] No receptionist for DID:", ourDid);
    return NextResponse.json({ received: true });
  }

  const base =
    process.env.TELNYX_WEBHOOK_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL;
  if (!base?.trim() || isPlaceholderUrl(base)) {
    console.error("[telnyx/voice] TELNYX_WEBHOOK_BASE_URL not set");
    return NextResponse.json({ error: "Misconfiguration" }, { status: 503 });
  }

  const dir = direction.startsWith("inbound") ? "inbound" : "outbound";
  const callerPhone = eventType === "call.initiated" ? from : to;
  const wsBase = base.replace(/^http/, "ws").replace(/\/$/, "");
  const streamUrl = `${wsBase}/api/voice/stream?receptionist_id=${receptionist.id}&call_sid=${callControlId}&caller_phone=${encodeURIComponent(callerPhone ?? "")}&direction=${dir}`;

  try {
    if (eventType === "call.initiated") {
      await answerAndStream(callControlId, streamUrl);
    } else {
      await streamStart(callControlId, streamUrl);
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[telnyx/voice]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
