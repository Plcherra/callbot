/**
 * Telnyx voice webhook (API-only).
 * Answers incoming calls.
 */

import { NextResponse } from "next/server";
import Telnyx from "telnyx";

const apiKey = process.env.TELNYX_API_KEY;
const telnyx = apiKey ? new Telnyx({ apiKey }) : null;

export async function POST(req: Request) {
  console.log('Webhook POST received at', new Date().toISOString());  // <-- always log

  let body;
  try {
    body = await req.json();
  } catch (e) {
    console.log('Bad JSON:', (e as Error).message);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log("Webhook hit:", JSON.stringify(body, null, 2));

  if (body?.data?.event_type === "call.initiated" && telnyx) {
    const callControlId = body?.data?.payload?.call_control_id ?? body?.data?.call_control_id;

    if (callControlId) {
      await telnyx.calls.answer({ call_control_id: callControlId });
      console.log("Answered");
    }
  }

  return NextResponse.json({ success: true });
} 