/**
 * WebSocket handler for Telnyx audio streaming.
 * Receives audio from Telnyx, runs voice pipeline, sends TTS back.
 * Run via custom server (server.js).
 */

import type WebSocket from "ws";
import { runVoicePipeline } from "../app/lib/voicePipeline";

const VOICE_API_KEY = process.env.VOICE_SERVER_API_KEY;
const APP_URL = process.env.TELNYX_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;

type StreamParams = {
  receptionist_id?: string;
  call_sid?: string;
  caller_phone?: string;
  direction?: string;
};

function getStreamParams(urlOrSearch: string): StreamParams {
  const search = urlOrSearch.startsWith("?") ? urlOrSearch : `?${urlOrSearch}`;
  const u = new URL(search, "http://localhost");
  const params: StreamParams = {};
  u.searchParams.forEach((v, k) => {
    if (k === "receptionist_id") params.receptionist_id = v;
    if (k === "call_sid") params.call_sid = v;
    if (k === "caller_phone") params.caller_phone = v;
    if (k === "direction") params.direction = v;
  });
  return params;
}

async function fetchPrompt(receptionistId: string): Promise<{ prompt: string; greeting: string }> {
  const apiKey = VOICE_API_KEY;
  if (!apiKey || !APP_URL) {
    return {
      prompt: "You are an AI receptionist. Be helpful and concise.",
      greeting: "Hello! Thanks for calling. How can I help you today?",
    };
  }
  const base = APP_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/api/receptionist-prompt?receptionist_id=${receptionistId}`, {
    headers: { "x-voice-server-key": apiKey },
  });
  if (!res.ok) {
    return {
      prompt: "You are an AI receptionist. Be helpful and concise.",
      greeting: "Hello! Thanks for calling. How can I help you today?",
    };
  }
  const json = (await res.json()) as { prompt?: string; greeting?: string };
  return {
    prompt: json.prompt ?? "You are an AI receptionist. Be helpful and concise.",
    greeting: json.greeting ?? "Hello! Thanks for calling. How can I help you today?",
  };
}

export function handleVoiceStreamConnection(ws: WebSocket, request: { url?: string; search?: string }): void {
  const params = getStreamParams(request.search ?? request.url ?? "");
  const receptionistId = params.receptionist_id ?? "";

  console.log("[voice/stream] WebSocket connected", {
    receptionist_id: receptionistId,
    call_sid: params.call_sid,
    direction: params.direction,
  });

  const deepgramKey = process.env.DEEPGRAM_API_KEY ?? "";
  const grokKey = process.env.GROK_API_KEY ?? "";
  const elevenlabsKey = process.env.ELEVENLABS_API_KEY ?? "";
  const elevenlabsVoice = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

  if (!deepgramKey || !grokKey || !elevenlabsKey) {
    console.error("[voice/stream] Missing DEEPGRAM_API_KEY, GROK_API_KEY, or ELEVENLABS_API_KEY");
    ws.close();
    return;
  }

  let pipeline: { sendAudio: (chunk: Buffer) => void; stop: () => void } | null = null;

  async function initPipeline() {
    try {
      const { prompt, greeting } = await fetchPrompt(receptionistId);
      console.log("[voice/stream] Pipeline init: greeting len=", greeting?.length ?? 0);
      const result = await runVoicePipeline(
        {
          deepgramApiKey: deepgramKey,
          grokApiKey: grokKey,
          elevenlabsApiKey: elevenlabsKey,
          elevenlabsVoiceId: elevenlabsVoice,
          systemPrompt: prompt,
          greeting,
        },
        {
          onAudio: (buffer) => {
            if (ws.readyState === 1) ws.send(Buffer.from(buffer));
          },
          onError: (err) => console.error("[voice/stream] Pipeline error:", err?.message ?? err),
        }
      );
      pipeline = result;
      console.log("[voice/stream] Pipeline ready, playing greeting");
    } catch (err) {
      console.error("[voice/stream] Init failed:", err instanceof Error ? err.message : err, err instanceof Error ? err.stack : "");
      ws.close();
    }
  }

  initPipeline();

  ws.on("message", (data: Buffer | string) => {
    let chunk: Buffer | null = null;
    if (Buffer.isBuffer(data)) {
      chunk = data;
    } else if (typeof data === "string") {
      try {
        const msg = JSON.parse(data) as { event?: string; payload?: string };
        if (msg.payload) chunk = Buffer.from(msg.payload, "base64");
      } catch {
        // ignore non-JSON
      }
    }
    if (chunk && pipeline) pipeline.sendAudio(chunk);
  });

  ws.on("close", () => {
    pipeline?.stop();
  });
}
