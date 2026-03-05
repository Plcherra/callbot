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
      const response = await fetch(
        `https://api.telnyx.com/v2/calls/${encodeURIComponent(callControlId)}/actions/answer`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      if (response.ok) {
        console.log("Answered via API");
      } else {
        console.log("Answer failed:", await response.text());
      }
    }
  }

  return NextResponse.json({ success: true });
} 