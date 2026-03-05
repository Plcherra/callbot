/**
 * Telnyx voice webhook (API-only).
 * Answers incoming calls.
 */

import { NextResponse } from "next/server";
import Telnyx from "telnyx";

const apiKey = process.env.TELNYX_API_KEY;
const telnyx = apiKey ? new Telnyx({ apiKey }) : null;

export async function POST(req: Request) {
  const body = await req.json();
  console.log("Webhook hit:", body);

  if (body?.data?.event_type === "call.initiated" && telnyx) {
    const callControlId =
      body?.data?.payload?.call_control_id ?? body?.data?.call_control_id;

    if (callControlId) {
      await telnyx.calls.actions.answer(callControlId, {});
      console.log("Answered");
    }
  }

  return NextResponse.json({ success: true });
}
