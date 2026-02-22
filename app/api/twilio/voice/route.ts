import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { createServiceRoleClient } from "@/app/lib/supabase/server";

/** Detect placeholder or invalid webhook URLs */
function isPlaceholderUrl(value: string): boolean {
  return /your-app\.com|your-domain\.com/i.test(value);
}

/**
 * Build the absolute action URL for Gather callbacks.
 * Twilio needs a public URL to POST back to after speech input.
 */
function getActionUrl(path: string): string | null {
  const base =
    process.env.TWILIO_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!base?.trim() || isPlaceholderUrl(base)) return null;
  return `${base.replace(/\/$/, "")}${path}`;
}

/**
 * Twilio voice webhook for incoming calls.
 *
 * Supports two modes (TWILIO_VOICE_MODE env):
 * - "gather" (default): Uses <Gather input="speech"> for STT. Placeholder AI returns static response.
 *   Supports multi-turn by chaining Gather after each Say.
 * - "streams": Connects to self-hosted voice server via Media Streams (WebSocket).
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const to = (formData.get("To") as string | null)?.trim();
  const from = (formData.get("From") as string | null)?.trim();
  const callSid = (formData.get("CallSid") as string | null)?.trim();

  // SpeechResult = transcribed text when caller spoke (from previous Gather)
  const speechResult = (formData.get("SpeechResult") as string | null)?.trim();
  const speechError = (formData.get("SpeechResultError") as string | null)?.trim();

  if (!to) {
    console.error("[twilio/voice] Missing To in webhook");
    return twiMlResponse("This number is not configured.");
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
    console.warn("[twilio/voice] No receptionist found for To:", to);
    return twiMlResponse("This number is not configured. Please try again later.");
  }

  const voiceMode = process.env.TWILIO_VOICE_MODE || "gather";

  if (voiceMode === "streams") {
    return handleMediaStreams(receptionist, to);
  }

  // --- Gather mode (default) ---
  return handleGatherSpeech({
    receptionist,
    callSid: callSid ?? null,
    speechResult: speechResult ?? null,
    speechError: speechError ?? null,
    from: from ?? null,
    to,
  });
}

/**
 * Media Streams: Connect to self-hosted WebSocket voice server.
 */
async function handleMediaStreams(
  receptionist: { id: string },
  _to: string
): Promise<NextResponse> {
  const voiceServerUrl = process.env.VOICE_SERVER_WS_URL;
  if (!voiceServerUrl?.trim() || isPlaceholderUrl(voiceServerUrl)) {
    console.error("[twilio/voice] VOICE_SERVER_WS_URL not set");
    return twiMlResponse("Service temporarily unavailable.");
  }

  const webhookBase = process.env.TWILIO_WEBHOOK_BASE_URL;
  const statusCallbackUrl =
    webhookBase && !isPlaceholderUrl(webhookBase)
      ? `${webhookBase.replace(/\/$/, "")}/api/twilio/status`
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

type GatherContext = {
  receptionist: { id: string; name?: string };
  callSid: string | null;
  speechResult: string | null;
  speechError: string | null;
  from: string | null;
  to: string;
};

/**
 * Gather mode: Use <Gather input="speech"> for STT.
 * - If SpeechResult present → placeholder AI (static Say) + another Gather for multi-turn
 * - If no input / error → prompt user to speak again
 * - Initial call → greet + first Gather
 */
async function handleGatherSpeech(ctx: GatherContext): Promise<NextResponse> {
  const { receptionist, speechResult, speechError } = ctx;
  const actionUrl = getActionUrl("/api/twilio/voice");

  if (!actionUrl) {
    console.error("[twilio/voice] TWILIO_WEBHOOK_BASE_URL or NEXT_PUBLIC_APP_URL not set");
    return twiMlResponse("Service temporarily unavailable.");
  }

  const response = new twilio.twiml.VoiceResponse();
  const name = receptionist.name || "your AI receptionist";

  // --- Caller spoke and we got transcription ---
  if (speechResult) {
    // TODO: Replace with real AI call (e.g. POST to your VPS API)
    // For now: placeholder static response
    const aiResponse = getPlaceholderAiResponse(speechResult);
    response.say(
      { voice: "alice", language: "en-US" },
      aiResponse
    );

    // Multi-turn: ask if they need anything else, then Gather again
    response.say(
      { voice: "alice", language: "en-US" },
      "Is there anything else I can help you with? Please say your response or hang up when done."
    );
    const gather = response.gather({
      input: ["speech"],
      action: actionUrl,
      method: "POST",
      timeout: 5,
      speechTimeout: "auto",
      actionOnEmptyResult: true,
      language: "en-US",
    });
    gather.say(
      { voice: "alice", language: "en-US" },
      "I'm listening."
    );
  }
  // --- No speech / error / timeout (initial call or actionOnEmptyResult) ---
  else {
    const prompt = speechError
      ? "I didn't catch that. Please tell me how I can help you."
      : `Hello! Thanks for calling. I'm ${name}, your AI receptionist. How can I help you today?`;
    response.say({ voice: "alice", language: "en-US" }, prompt);
    const gather = response.gather({
      input: ["speech"],
      action: actionUrl,
      method: "POST",
      timeout: 5,
      speechTimeout: "auto",
      actionOnEmptyResult: true,
      language: "en-US",
    });
    gather.say({ voice: "alice", language: "en-US" }, "Please tell me what you need.");
  }

  return new NextResponse(response.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}

/**
 * Placeholder AI: returns static response.
 * Replace with real AI API call (e.g. to your VPS) later.
 */
function getPlaceholderAiResponse(userInput: string): string {
  const lower = userInput.toLowerCase();
  if (
    lower.includes("appointment") ||
    lower.includes("book") ||
    lower.includes("schedule")
  ) {
    return "I'd be happy to help you book an appointment. Our team will call you back shortly to confirm a time.";
  }
  if (lower.includes("hours") || lower.includes("open")) {
    return "Our business hours are Monday through Friday, 9 AM to 6 PM.";
  }
  if (lower.includes("thanks") || lower.includes("thank you") || lower.includes("bye")) {
    return "You're welcome! Have a great day.";
  }
  return "Thanks for your message. A team member will get back to you shortly. Is there anything else?";
}

function twiMlResponse(message: string): NextResponse {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ voice: "alice", language: "en-US" }, message);
  response.hangup();
  return new NextResponse(response.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
