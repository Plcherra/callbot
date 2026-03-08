/**
 * Voice stream info (HTTP only).
 * WebSocket is handled by the Python FastAPI backend.
 * Connect to: wss://your-voice-backend/api/voice/stream?call_sid=...
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest) {
  return NextResponse.json({
    message: "WebSocket required. Connect to the FastAPI voice backend.",
    flow: "Telnyx RTP → Deepgram STT → Grok LLM → ElevenLabs TTS → Telnyx",
  });
}
