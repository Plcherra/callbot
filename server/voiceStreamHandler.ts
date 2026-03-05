/**
 * WebSocket handler for Telnyx audio streaming.
 * Receives audio from Telnyx, runs voice pipeline, sends TTS back.
 * Run via custom server (server.js).
 */

import type WebSocket from "ws";
import { runVoicePipeline } from "../app/lib/voicePipeline";

const VOICE_API_KEY = process.env.VOICE_SERVER_API_KEY;

/** PCMU/mulaw silence: 0xFF. 20ms at 8kHz = 160 bytes. Keep-alive every 5s prevents Telnyx disconnect (>10s idle). */
const SILENCE_PACKET = Buffer.alloc(160, 0xff);
const KEEPALIVE_MS = 5000;

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

  // Deduplicate: one WebSocket per call (Telnyx retries create multiple connections)
  // "Newest wins" - close any existing connection and replace with this one
  if (callSid) {
    const existing = activeByCallSid.get(callSid);
    if (existing && existing.readyState === 1) {
      console.log("[voice/stream] Replacing previous connection for call_sid=", callSid);
      activeByCallSid.delete(callSid);
      existing.close(1000, "Replaced");
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
  console.log("[voice/stream] RTP stream open - sending silence packet");

  function sendSilenceKeepalive() {
    if (ws.readyState !== 1) return;
    const payload = SILENCE_PACKET.toString("base64");
    ws.send(JSON.stringify({ event: "media", media: { payload } }));
  }
  sendSilenceKeepalive();
  const keepaliveInterval = setInterval(sendSilenceKeepalive, KEEPALIVE_MS);

  let chunkReceived = false;
  const noAudioTimeout = setTimeout(() => {
    if (!chunkReceived) {
      console.log("[voice/stream] No audio from Telnyx");
    }
  }, 5000);

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
      if (ws.readyState !== 1 || (callSid && activeByCallSid.get(callSid) !== ws)) return;
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
      if (ws.readyState !== 1 || (callSid && activeByCallSid.get(callSid) !== ws)) {
        result.stop();
        return;
      }
      pipeline = result;
      console.log("[voice/stream] Pipeline ready, playing greeting");
    } catch (err) {
      if (ws.readyState === 1) {
        console.error("[voice/stream] Init failed:", err instanceof Error ? err.message : err, err instanceof Error ? err.stack : "");
        ws.close();
      }
    }
  }

  initPipeline();

  ws.on("message", (data: Buffer | string) => {
    messageCount++;
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
    if (chunk) {
      chunkReceived = true;
      console.log("[voice/stream] RTP chunk len:", chunk.length);
      if (pipeline) pipeline.sendAudio(chunk);
    }
  });

  ws.on("close", () => {
    clearInterval(keepaliveInterval);
    clearTimeout(noAudioTimeout);
    // Only remove if we're still the active connection (weren't replaced)
    if (callSid && activeByCallSid.get(callSid) === ws) {
      activeByCallSid.delete(callSid);
    }
    pipeline?.stop();
  });
}
