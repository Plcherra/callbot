/**
 * Voice stream WebSocket endpoint.
 *
 * WebSocket upgrade is handled by the custom server (server.js), which pipes:
 * - Incoming RTP audio from Telnyx → Deepgram STT → Grok LLM → ElevenLabs TTS → Telnyx
 *
 * This route handles HTTP GET only (e.g. health checks). For WebSocket, use:
 * wss://your-domain/api/voice/stream?call_sid=...
 *
 * Run `tsx server.js` (not `next start`) for WebSocket support.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest) {
  return NextResponse.json({
    message: "WebSocket required. Connect to wss:// endpoint. Run `tsx server.js` for WebSocket support.",
    flow: "Telnyx RTP → Deepgram STT → Grok LLM → ElevenLabs TTS → Telnyx",
  });
}
