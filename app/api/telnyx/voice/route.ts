/**
 * Telnyx voice webhook (API-only).
 * Answers incoming calls.
 */

import { NextResponse } from "next/server";

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

  const b = body as { data?: { event_type?: string; payload?: { call_control_id?: string }; call_control_id?: string } };
  if (b?.data?.event_type === "call.initiated") {
    const callControlId = b?.data?.payload?.call_control_id ?? b?.data?.call_control_id;

    if (callControlId) {
      const apiKey = process.env.TELNYX_API_KEY;
      const base = process.env.TELNYX_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://echodesk.us";
      const wsBase = base.replace(/^http/, "ws").replace(/\/$/, "");
      const streamUrl = `${wsBase}/api/voice/stream?call_sid=${encodeURIComponent(callControlId)}`;

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