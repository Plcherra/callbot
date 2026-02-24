import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import {
  parseFormParams,
  getStringParam,
  validateTwilioRequest,
} from "@/app/lib/twilioWebhook";

/**
 * Twilio SMS webhook for incoming text messages.
 *
 * - Looks up receptionist by the Twilio number (To)
 * - Placeholder: returns a static reply. Replace with real AI/SMS logic later.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const params = parseFormParams(rawBody);
  const signature = req.headers.get("x-twilio-signature");

  if (!validateTwilioRequest(rawBody, signature, params, "/api/twilio/sms")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const to = getStringParam(params, "To");
  const from = getStringParam(params, "From");
  const body = getStringParam(params, "Body");
  const messageSid = getStringParam(params, "MessageSid");

  if (!to) {
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { "Content-Type": "text/xml" } }
    );
  }

  const supabase = createServiceRoleClient();
  let receptionist: { id: string; name?: string } | null = null;

  const { data: byTwilio } = await supabase
    .from("receptionists")
    .select("id, name")
    .eq("twilio_phone_number", to)
    .eq("status", "active")
    .maybeSingle();
  if (byTwilio) receptionist = byTwilio;
  else {
    const { data: byInbound } = await supabase
      .from("receptionists")
      .select("id, name")
      .eq("inbound_phone_number", to)
      .eq("status", "active")
      .maybeSingle();
    receptionist = byInbound;
  }

  if (!receptionist) {
    console.warn("[twilio/sms] No receptionist found for To:", to);
    // Still return valid TwiML (empty = no reply)
    const response = new twilio.twiml.MessagingResponse();
    return new NextResponse(response.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  // TODO: Replace with real AI/SMS logic (e.g. call your VPS API)
  const reply = getPlaceholderSmsReply(body ?? undefined, receptionist.name);

  const response = new twilio.twiml.MessagingResponse();
  response.message(reply);

  // Log for debugging (optional, remove in production if noisy)
  if (process.env.NODE_ENV === "development") {
    console.log("[twilio/sms]", {
      to,
      from,
      messageSid,
      receptionistId: receptionist.id,
      bodyLength: body?.length ?? 0,
    });
  }

  return new NextResponse(response.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}

/**
 * Placeholder SMS reply. Replace with real AI or business logic.
 */
function getPlaceholderSmsReply(incomingBody: string | undefined, name?: string): string {
  const business = name || "us";
  if (!incomingBody?.trim()) {
    return `Thanks for messaging ${business}. How can we help you?`;
  }
  const lower = incomingBody.toLowerCase();
  if (lower.includes("hours") || lower.includes("open")) {
    return "Our hours are Monday–Friday 9 AM to 6 PM. Is there anything else?";
  }
  if (lower.includes("appointment") || lower.includes("book") || lower.includes("schedule")) {
    return "We'd love to help you book. Reply with your preferred time or call us to schedule.";
  }
  return `Thanks for your message. A team member will get back to you shortly.`;
}
