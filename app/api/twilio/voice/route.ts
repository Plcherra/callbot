import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import twilio from "twilio";

/**
 * Twilio voice webhook for incoming calls.
 * Returns TwiML to connect the call to our voice server via Media Streams.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const to = formData.get("To") as string | null;
  const from = formData.get("From") as string | null;

  if (!to?.trim()) {
    console.error("[twilio/voice] Missing To in webhook");
    return twiMlError("This number is not configured.");
  }

  const supabase = createServiceRoleClient();

  // Look up receptionist by Twilio number or inbound_phone_number (migration)
  let receptionist: { id: string } | null = null;
  const { data: byTwilio } = await supabase
    .from("receptionists")
    .select("id")
    .eq("twilio_phone_number", to)
    .eq("status", "active")
    .maybeSingle();
  if (byTwilio) {
    receptionist = byTwilio;
  } else {
    const { data: byInbound } = await supabase
      .from("receptionists")
      .select("id")
      .eq("inbound_phone_number", to)
      .eq("status", "active")
      .maybeSingle();
    receptionist = byInbound;
  }

  if (!receptionist) {
    console.warn("[twilio/voice] No receptionist found for To:", to);
    return twiMlError("This number is not configured. Please try again later.");
  }

  const voiceServerUrl = process.env.VOICE_SERVER_WS_URL;
  if (!voiceServerUrl?.trim()) {
    console.error("[twilio/voice] VOICE_SERVER_WS_URL not set");
    return twiMlError("Service temporarily unavailable.");
  }

  const statusCallbackUrl = process.env.TWILIO_WEBHOOK_BASE_URL
    ? `${process.env.TWILIO_WEBHOOK_BASE_URL.replace(/\/$/, "")}/api/twilio/status`
    : undefined;

  const response = new twilio.twiml.VoiceResponse();
  const connect = response.connect();
  const stream = connect.stream({
    url: voiceServerUrl,
    name: receptionist.id,
    statusCallback: statusCallbackUrl,
  });
  stream.parameter({ name: "receptionist_id", value: receptionist.id });

  return new NextResponse(response.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}

function twiMlError(message: string): NextResponse {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ voice: "alice" }, message);
  response.hangup();
  return new NextResponse(response.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
