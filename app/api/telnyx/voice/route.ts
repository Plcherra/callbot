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
    `${TELNYX_API}/calls/${encodeURIComponent(callControlId)}/actions/streaming_start`,
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
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telnyx streaming_start failed: ${err}`);
  }
}

async function answerAndStream(
  callControlId: string,
  streamUrl: string
): Promise<void> {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) throw new Error("TELNYX_API_KEY not set");

  const answerRes = await fetch(
    `${TELNYX_API}/calls/${encodeURIComponent(callControlId)}/actions/answer`,
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

function headersToObject(headers: Headers): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((v, k) => { obj[k] = v; });
  return obj;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("t-signature") ?? req.headers.get("telnyx-signature");
  const publicKey = process.env.TELNYX_PUBLIC_KEY;
  const webhookSecret = process.env.TELNYX_WEBHOOK_SECRET;
  const headersObj = headersToObject(req.headers);

  if (
    !validateTelnyxWebhook(rawBody, signature, {
      publicKey: publicKey ?? undefined,
      webhookSecret: webhookSecret ?? undefined,
      headers: headersObj,
    })
  ) {
    console.error("[telnyx/voice] Webhook validation failed. Ensure TELNYX_PUBLIC_KEY (API v2) or TELNYX_WEBHOOK_SECRET (API v1) is set.");
    return new NextResponse("Forbidden", { status: 403 });
  }

  const event = parseTelnyxEvent(rawBody);
  if (!event) {
    console.warn("[telnyx/voice] Failed to parse event. Raw keys:", (() => {
      try {
        const p = JSON.parse(rawBody) as Record<string, unknown>;
        return Object.keys(p);
      } catch {
        return [];
      }
    })());
    return NextResponse.json({ received: true });
  }

  const eventType = event.event_type;
  console.log("[telnyx/voice] Event:", eventType);

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
    call_control_id?: string;
    call_leg_id?: string;
    to?: string;
    from?: string;
    direction?: string;
  };
  const payload = data?.payload ?? data;
  const callControlId =
    payload?.call_control_id ?? payload?.call_leg_id ?? data?.call_control_id ?? data?.call_leg_id;
  const to = payload?.to ?? data?.to;
  const from = payload?.from ?? data?.from;
  const direction = ((payload?.direction ?? data?.direction) ?? "").toLowerCase();

  if (!callControlId) {
    console.error("[telnyx/voice] Missing call_control_id");
    return NextResponse.json({ error: "Missing payload" }, { status: 400 });
  }

  // Inbound: call.initiated, to = our DID. Outbound: call.answered, from = our DID.
  const ourDid = eventType === "call.initiated" ? to : from;
  console.log("[telnyx/voice] Payload: to=", to, "from=", from, "ourDid=", ourDid, "direction=", direction);

  if (!ourDid) {
    console.error("[telnyx/voice] Missing to/from");
    return NextResponse.json({ error: "Missing payload" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const receptionist = await getReceptionistByPhoneNumber(supabase, ourDid);

  if (!receptionist) {
    console.warn("[telnyx/voice] No receptionist for DID:", ourDid, "- check telnyx_phone_number / inbound_phone_number in DB");
    return NextResponse.json({ received: true });
  }

  console.log("[telnyx/voice] Receptionist found:", receptionist.id, receptionist.name);

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

  console.log("[telnyx/voice] streamUrl=", streamUrl, "(Telnyx must be able to reach this)");

  try {
    if (eventType === "call.initiated") {
      await answerAndStream(callControlId, streamUrl);
      console.log("[telnyx/voice] Answered and stream_start OK for", callControlId);
    } else {
      await streamStart(callControlId, streamUrl);
      console.log("[telnyx/voice] stream_start OK for", callControlId);
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[telnyx/voice]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
