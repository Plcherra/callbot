/**
 * WebSocket handler for Telnyx audio streaming.
 * Receives audio from Telnyx, runs voice pipeline, sends TTS back.
 * Run via custom server (server.js).
 */

import type WebSocket from "ws";
import { runVoicePipeline } from "../app/lib/voicePipeline";

const VOICE_API_KEY = process.env.VOICE_SERVER_API_KEY;

/** Active WebSocket per call_sid to avoid duplicate pipelines (Telnyx retries, etc.) */
const activeByCallSid = new Map<string, WebSocket>();
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
  const callSid = params.call_sid ?? "";

  // Deduplicate: one WebSocket per call (Telnyx may retry; multiple pipelines hit ElevenLabs concurrency limit)
  // Claim slot synchronously to avoid race when many connections arrive in parallel
  if (callSid) {
    const existing = activeByCallSid.get(callSid);
    if (existing && existing.readyState === 1) {
      console.log("[voice/stream] Rejecting duplicate connection for call_sid=", callSid);
      ws.close(1000, "Duplicate");
      return;
    }
    activeByCallSid.set(callSid, ws);
  }

  const deepgramKey = process.env.DEEPGRAM_API_KEY ?? "";
  const grokKey = process.env.GROK_API_KEY ?? "";
  const elevenlabsKey = process.env.ELEVENLABS_API_KEY ?? "";
  const elevenlabsVoice = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

  console.log("[voice/stream] WebSocket connected", {
    receptionist_id: receptionistId,
    call_sid: params.call_sid,
    direction: params.direction,
    api_keys: { DG: !!deepgramKey, Grok: !!grokKey, ElevenLabs: !!elevenlabsKey },
  });

  if (!deepgramKey || !grokKey || !elevenlabsKey) {
    if (callSid) activeByCallSid.delete(callSid);
    console.error("[voice/stream] MISSING API KEYS - DEEPGRAM:", !!deepgramKey, "GROK:", !!grokKey, "ELEVENLABS:", !!elevenlabsKey, "- Set these on the VPS (PM2 env or .env)");
    ws.close();
    return;
  }

  let pipeline: { sendAudio: (chunk: Buffer) => void; stop: () => void } | null = null;
  let messageCount = 0;

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
            if (ws.readyState !== 1) return;
            const payload = Buffer.from(buffer).toString("base64");
            ws.send(JSON.stringify({ event: "media", media: { payload } }));
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
    messageCount++;
    if (messageCount <= 3) {
      const evt = typeof data === "string" ? (() => { try { return (JSON.parse(data) as { event?: string })?.event; } catch { return "?"; } })() : "binary";
      console.log("[voice/stream] Telnyx msg #" + messageCount, "event=" + evt);
    }
    let chunk: Buffer | null = null;
    if (Buffer.isBuffer(data)) {
      chunk = data;
    } else if (typeof data === "string") {
      try {
        const msg = JSON.parse(data) as { event?: string; media?: { payload?: string }; payload?: string };
        const b64 = msg.media?.payload ?? msg.payload;
        if (b64) chunk = Buffer.from(b64, "base64");
      } catch {
        // ignore non-JSON
      }
    }
    if (chunk && pipeline) pipeline.sendAudio(chunk);
  });

  ws.on("close", () => {
    if (callSid) activeByCallSid.delete(callSid);
    pipeline?.stop();
  });
}
