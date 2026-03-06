/**
 * WebSocket handler for Telnyx audio streaming.
 * Receives audio from Telnyx, runs voice pipeline, sends TTS back.
 * Run via custom server (server.js).
 */

import type WebSocket from "ws";
import { runVoicePipeline } from "../app/lib/voicePipeline";

const VOICE_API_KEY = process.env.VOICE_SERVER_API_KEY;

/** PCMU/mulaw silence: 0xFF. 20ms at 8kHz = 160 bytes. Keep-alive every 2s prevents Telnyx disconnect. */
const SILENCE_PACKET = Buffer.alloc(160, 0xff);
const KEEPALIVE_MS = 2000;

/** Active WebSocket per call_sid to avoid duplicate pipelines (Telnyx retries, etc.) */
const activeByCallSid = new Map<string, WebSocket>();
const PORT = process.env.PORT || "3000";
/** Prefer localhost to avoid external round-trip during prompt fetch (prevents 1006/timeout). */
const PROMPT_BASE =
  process.env.VOICE_PROMPT_BASE_URL || `http://127.0.0.1:${PORT}`;

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
  if (!apiKey) {
    return {
      prompt: "You are an AI receptionist. Be helpful and concise.",
      greeting: "Hello! Thanks for calling. How can I help you today?",
    };
  }
  const base = PROMPT_BASE.replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${base}/api/receptionist-prompt?receptionist_id=${receptionistId}`, {
      headers: { "x-voice-server-key": apiKey },
      signal: controller.signal,
    });
    clearTimeout(timeout);
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
  } catch (err) {
    clearTimeout(timeout);
    console.warn("[voice/stream] fetchPrompt failed:", err instanceof Error ? err.message : err);
    return {
      prompt: "You are an AI receptionist. Be helpful and concise.",
      greeting: "Hello! Thanks for calling. How can I help you today?",
    };
  }
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
  const dummyTest = process.env.VOICE_DUMMY_TEST === "1";

  async function initPipeline() {
    try {
      console.log("[voice/stream] OPENED - starting pipeline for receptionist:", receptionistId);
      if (dummyTest) {
        console.log("[voice/stream] DUMMY TEST MODE - sending 1s mulaw silence every 2s (bypass pipeline)");
        const dummyInterval = setInterval(() => {
          if (ws.readyState !== 1) {
            clearInterval(dummyInterval);
            return;
          }
          const dummyAudio = Buffer.alloc(8000, 0xff);
          const payload = dummyAudio.toString("base64");
          ws.send(JSON.stringify({ event: "media", media: { payload } }));
        }, 2000);
        ws.once("close", () => clearInterval(dummyInterval));
        console.log("[voice/stream] Dummy test active - if you hear tone/silence, WS send works");
        return;
      }
      console.log("[voice/stream] Step 1: Fetching prompt...");
      const { prompt, greeting } = await fetchPrompt(receptionistId);
      if (ws.readyState !== 1 || (callSid && activeByCallSid.get(callSid) !== ws)) {
        console.log("[voice/stream] Aborted: WS closed or replaced");
        return;
      }
      console.log("[voice/stream] Step 2: Prompt fetched, greeting len=", greeting?.length ?? 0);
      console.log("[voice/stream] Step 3: Creating voice pipeline (Deepgram+Grok+ElevenLabs)...");
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
            try {
              if (ws.readyState !== 1) return;
              const payload = Buffer.from(buffer).toString("base64");
              ws.send(JSON.stringify({ event: "media", media: { payload } }));
            } catch (err) {
              console.error("[voice/stream] onAudio send error:", err instanceof Error ? err.stack : err);
            }
          },
          onError: (err) =>
            console.error("[voice/stream] Pipeline error:", err?.message ?? err, err instanceof Error ? err.stack : ""),
        }
      );
      if (ws.readyState !== 1 || (callSid && activeByCallSid.get(callSid) !== ws)) {
        result.stop();
        return;
      }
      pipeline = result;
      console.log("[voice/stream] Pipeline ready, playing greeting");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : "";
      console.error("[voice/stream] Init FAILED:", msg);
      console.error("[voice/stream] Stack:", stack);
      if (ws.readyState === 1) {
        ws.close(1011, "Pipeline init error");
      }
    }
  }

  initPipeline().catch((err) => {
    console.error("[voice/stream] Init pipeline REJECTED (unhandled):", err?.message ?? err);
    console.error("[voice/stream] Stack:", err instanceof Error ? err.stack : "");
    if (ws.readyState === 1) ws.close(1011, "Pipeline init rejected");
  });

  ws.on("message", (data: Buffer | string) => {
    try {
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
        if (messageCount <= 3 || messageCount % 50 === 0) {
          console.log("[voice/stream] Message received, type:", typeof data, "len:", chunk.length);
        }
        if (pipeline) pipeline.sendAudio(chunk);
      }
    } catch (err) {
      console.error("[voice/stream] Message processing error:", err instanceof Error ? err.stack : err);
    }
  });

  ws.on("error", (err) => {
    console.error("[voice/stream] WebSocket ERROR:", err?.message ?? err, err instanceof Error ? err.stack : "");
  });

  ws.on("close", (code, reason) => {
    clearInterval(keepaliveInterval);
    clearTimeout(noAudioTimeout);
    console.log("[voice/stream] CLOSED - code:", code, "reason:", reason?.toString() || "none");
    // Only remove if we're still the active connection (weren't replaced)
    if (callSid && activeByCallSid.get(callSid) === ws) {
      activeByCallSid.delete(callSid);
    }
    pipeline?.stop();
  });
}
