/**
 * WebSocket handler for Telnyx bidirectional RTP streaming.
 * Receives RTP from Telnyx → Deepgram STT → Grok LLM → ElevenLabs TTS → sends media back.
 * Run via custom server (server.js).
 *
 * 1006 / silence killer fixes:
 * - Silence every 3s (Telnyx ~10s idle kill; community: 3s prevents 1006)
 * - WebSocket ping every 10s (keeps connection alive through NAT/proxies)
 * - Send silence packet IMMEDIATELY on connect, before async pipeline init
 * - Comprehensive event logging (code, reason, timestamp)
 */

import type WebSocket from "ws";
import { runVoicePipeline } from "../app/lib/voicePipeline";
import { getPrompt as getCachedPrompt } from "../app/lib/promptCache";

const VOICE_API_KEY = process.env.VOICE_SERVER_API_KEY;

/** PCMU/mulaw silence: 0xFF. 20ms at 8kHz = 160 bytes. */
const SILENCE_PACKET = Buffer.alloc(160, 0xff);

/** Silence interval: 3s. Telnyx docs imply ~10s idle kill; community fixes say 3s prevents 1006. */
const SILENCE_INTERVAL_MS = 3000;

/** WebSocket ping interval: 10s. Keeps connection alive through NAT/proxies. */
const PING_INTERVAL_MS = 10000;

/** No RTP heartbeat: log if no incoming audio for this long. */
const NO_AUDIO_WARN_MS = 5000;

/** Active WebSocket per call_sid to avoid duplicate pipelines (Telnyx retries, etc.) */
const activeByCallSid = new Map<string, WebSocket>();
const PORT = process.env.PORT || "3000";
const PROMPT_BASE =
  process.env.VOICE_PROMPT_BASE_URL || `http://127.0.0.1:${PORT}`;

type StreamParams = {
  receptionist_id?: string;
  call_sid?: string;
  caller_phone?: string;
  direction?: string;
};

function ts(): string {
  return new Date().toISOString();
}

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

/**
 * Send Telnyx media: { event: 'media', media: { payload: base64 } }
 * 160-byte 0xFF mulaw = silence.
 */
function sendMedia(ws: WebSocket, buffer: Buffer): void {
  if (ws.readyState !== 1) return;
  const payload = buffer.toString("base64");
  ws.send(JSON.stringify({ event: "media", media: { payload } }));
}

export function handleVoiceStreamConnection(ws: WebSocket, request: { url?: string; search?: string }): void {
  const params = getStreamParams(request.search ?? request.url ?? "");
  const receptionistId = params.receptionist_id ?? "";
  const callSid = params.call_sid ?? "";

  // Deduplicate: one WebSocket per call
  if (callSid) {
    const existing = activeByCallSid.get(callSid);
    if (existing && existing.readyState === 1) {
      console.log(`[voice/stream] ${ts()} CLOSE duplicate - rejecting call_sid=${callSid.slice(0, 20)}...`);
      ws.close(1000, "Duplicate");
      return;
    }
    activeByCallSid.set(callSid, ws);
  }

  const deepgramKey = process.env.DEEPGRAM_API_KEY ?? "";
  const grokKey = process.env.GROK_API_KEY ?? "";
  const elevenlabsKey = process.env.ELEVENLABS_API_KEY ?? "";
  const elevenlabsVoice = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

  console.log(`[voice/stream] ${ts()} OPEN connected`, {
    receptionist_id: receptionistId,
    call_sid: callSid.slice(0, 24),
    direction: params.direction,
    api_keys: { DG: !!deepgramKey, Grok: !!grokKey, ElevenLabs: !!elevenlabsKey },
  });

  // --- CRITICAL: Send silence IMMEDIATELY before any async work ---
  sendMedia(ws, SILENCE_PACKET);
  console.log(`[voice/stream] ${ts()} silence sent (160 bytes mulaw 0xFF)`);

  const silenceInterval = setInterval(() => {
    if (ws.readyState !== 1) return;
    sendMedia(ws, SILENCE_PACKET);
  }, SILENCE_INTERVAL_MS);

  const pingInterval = setInterval(() => {
    if (ws.readyState !== 1) return;
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  }, PING_INTERVAL_MS);

  let lastRtpAt = Date.now();
  let chunkReceived = false;
  let noAudioLogged = false;
  let lastSilenceLogAt = 0;
  const noAudioChecker = setInterval(() => {
    if (ws.readyState !== 1) return;
    const elapsed = Date.now() - lastRtpAt;
    if (!chunkReceived && elapsed >= NO_AUDIO_WARN_MS && !noAudioLogged) {
      noAudioLogged = true;
      console.log(`[voice/stream] ${ts()} heartbeat: No audio from Telnyx for ${Math.round(elapsed / 1000)}s`);
    } else if (chunkReceived && elapsed >= NO_AUDIO_WARN_MS) {
      if (Date.now() - lastSilenceLogAt >= 30000) {
        lastSilenceLogAt = Date.now();
        console.log(`[voice/stream] ${ts()} heartbeat: No RTP for ${Math.round(elapsed / 1000)}s (caller silent?)`);
      }
    }
  }, NO_AUDIO_WARN_MS);

  if (!deepgramKey || !grokKey || !elevenlabsKey) {
    clearInterval(silenceInterval);
    clearInterval(pingInterval);
    clearInterval(noAudioChecker);
    if (callSid) activeByCallSid.delete(callSid);
    console.error(
      `[voice/stream] ${ts()} MISSING API KEYS DG=${!!deepgramKey} Grok=${!!grokKey} ElevenLabs=${!!elevenlabsKey}`
    );
    ws.close(1011, "Server misconfiguration");
    return;
  }

  let pipeline: { sendAudio: (chunk: Buffer) => void; stop: () => void } | null = null;
  let messageCount = 0;
  const dummyTest = process.env.VOICE_DUMMY_TEST === "1";

  async function initPipeline() {
    try {
      console.log(`[voice/stream] ${ts()} init starting receptionist=${receptionistId}`);
      if (dummyTest) {
        console.log("[voice/stream] DUMMY TEST - bypass pipeline, sending silence every 2s");
        const dummyInterval = setInterval(() => {
          if (ws.readyState !== 1) {
            clearInterval(dummyInterval);
            return;
          }
          sendMedia(ws, Buffer.alloc(8000, 0xff));
        }, 2000);
        ws.once("close", () => clearInterval(dummyInterval));
        return;
      }
      let promptData = callSid ? getCachedPrompt(callSid) : null;
      if (promptData) {
        console.log(`[voice/stream] ${ts()} prompt cached`);
      } else {
        console.log(`[voice/stream] ${ts()} prompt fetch...`);
        promptData = await fetchPrompt(receptionistId);
      }
      const { prompt, greeting } = promptData;
      if (ws.readyState !== 1 || (callSid && activeByCallSid.get(callSid) !== ws)) {
        console.log(`[voice/stream] ${ts()} aborted (ws closed or replaced)`);
        return;
      }
      console.log(`[voice/stream] ${ts()} pipeline create... greeting len=${greeting?.length ?? 0}`);
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
              sendMedia(ws, Buffer.from(buffer));
            } catch (err) {
              console.error("[voice/stream] onAudio error:", err instanceof Error ? err.stack : err);
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
      console.log(`[voice/stream] ${ts()} pipeline ready, greeting playing`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[voice/stream] ${ts()} init FAILED:`, msg, err instanceof Error ? err.stack : "");
      if (ws.readyState === 1) ws.close(1011, "Pipeline init error");
    }
  }

  initPipeline().catch((err) => {
    console.error(`[voice/stream] ${ts()} init REJECTED:`, err?.message ?? err);
    if (ws.readyState === 1) ws.close(1011, "Pipeline init rejected");
  });

  ws.on("message", (data: Buffer | string) => {
    try {
      messageCount++;
      let chunk: Buffer | null = null;
      let eventType: string | undefined;
      if (Buffer.isBuffer(data)) {
        chunk = data;
      } else if (typeof data === "string") {
        try {
          const msg = JSON.parse(data) as {
            event?: string;
            media?: { payload?: string };
            payload?: string;
          };
          eventType = msg.event;
          if (eventType === "connected" || eventType === "start") {
            console.log(`[voice/stream] ${ts()} message event=${eventType}`);
          }
          const b64 = msg.media?.payload ?? msg.payload;
          if (b64) chunk = Buffer.from(b64, "base64");
        } catch {
          /* ignore non-JSON */
        }
      }
      if (chunk) {
        chunkReceived = true;
        lastRtpAt = Date.now();
        if (messageCount <= 5 || messageCount % 100 === 0) {
          console.log(
            `[voice/stream] ${ts()} chunk len=${chunk.length} msg#=${messageCount} ${eventType ? `event=${eventType}` : ""}`
          );
        }
        if (pipeline) pipeline.sendAudio(chunk);
      }
    } catch (err) {
      console.error("[voice/stream] message error:", err instanceof Error ? err.stack : err);
    }
  });

  ws.on("error", (err) => {
    console.error(`[voice/stream] ${ts()} WS ERROR:`, err?.message ?? err);
  });

  ws.on("close", (code, reason) => {
    clearInterval(silenceInterval);
    clearInterval(pingInterval);
    clearInterval(noAudioChecker);
    const reasonStr = reason?.toString() || "none";
    const is1006 = code === 1006;
    if (is1006) {
      console.error(
        `[voice/stream] ${ts()} CLOSE 1006 (abnormal) code=${code} reason=${reasonStr} ` +
          `| Check: proxy_read_timeout, NAT, firewall, ngrok/public IP`
      );
    } else {
      console.log(`[voice/stream] ${ts()} CLOSE code=${code} reason=${reasonStr}`);
    }
    if (callSid && activeByCallSid.get(callSid) === ws) {
      activeByCallSid.delete(callSid);
    }
    pipeline?.stop();
  });
}
