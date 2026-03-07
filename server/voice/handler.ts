import type WebSocket from "ws";
import { runVoicePipeline } from "../../app/lib/voicePipeline";
import { getPrompt as getCachedPrompt } from "../../app/lib/promptCache";
import { fetchPrompt } from "./fetchPrompt";
import { getStreamParams, parseMessageChunk } from "./utils";
import { sendMedia } from "./sendMedia";
import { activeByCallSid } from "./activeConnections";
import {
  SILENCE_PACKET,
  SILENCE_INTERVAL_MS,
  PING_INTERVAL_MS,
  getPromptBase,
  VOICE_API_KEY,
} from "./constants";

export function handleVoiceStreamConnection(ws: WebSocket, request: { url?: string; search?: string }): void {
  const params = getStreamParams(request.search ?? request.url ?? "");
  const receptionistId = params.receptionist_id ?? "";
  const callSid = params.call_sid ?? "";

  if (callSid) {
    const existing = activeByCallSid.get(callSid);
    if (existing && existing.readyState === 1) {
      ws.close(1000, "Duplicate");
      return;
    }
    activeByCallSid.set(callSid, ws);
  }

  const deepgramKey = process.env.DEEPGRAM_API_KEY ?? "";
  const grokKey = process.env.GROK_API_KEY ?? "";
  const elevenlabsKey = process.env.ELEVENLABS_API_KEY ?? "";
  const elevenlabsVoice = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

  sendMedia(ws, SILENCE_PACKET);
  const silenceInterval = setInterval(() => { if (ws.readyState !== 1) return; sendMedia(ws, SILENCE_PACKET); }, SILENCE_INTERVAL_MS);
  const pingInterval = setInterval(() => { if (ws.readyState !== 1) return; try { ws.ping(); } catch { /* ignore */ } }, PING_INTERVAL_MS);
  if (!deepgramKey || !grokKey || !elevenlabsKey) {
    clearInterval(silenceInterval); clearInterval(pingInterval);
    callSid && activeByCallSid.delete(callSid);
    ws.close(1011, "Server misconfiguration");
    return;
  }

  let pipeline: { sendAudio: (chunk: Buffer) => void; stop: () => void } | null = null;
  const dummyTest = process.env.VOICE_DUMMY_TEST === "1";
  const PROMPT_BASE = getPromptBase();

  async function initPipeline() {
    try {
      if (dummyTest) {
        const dummyInterval = setInterval(() => {
          if (ws.readyState !== 1) { clearInterval(dummyInterval); return; }
          sendMedia(ws, Buffer.alloc(8000, 0xff));
        }, 2000);
        ws.once("close", () => clearInterval(dummyInterval));
        return;
      }
      let promptData = callSid ? getCachedPrompt(callSid) : null;
      if (!promptData) promptData = await fetchPrompt(receptionistId);
      if (ws.readyState !== 1 || (callSid && activeByCallSid.get(callSid) !== ws)) return;

      const { prompt, greeting } = promptData;
      const result = await runVoicePipeline(
        {
          deepgramApiKey: deepgramKey, grokApiKey: grokKey, elevenlabsApiKey: elevenlabsKey, elevenlabsVoiceId: elevenlabsVoice,
          systemPrompt: prompt, greeting,
          ...(receptionistId && VOICE_API_KEY && { receptionistId, voiceServerApiKey: VOICE_API_KEY, voiceServerBaseUrl: PROMPT_BASE }),
        },
        {
          onAudio: (buffer) => { try { if (ws.readyState !== 1) return; sendMedia(ws, Buffer.from(buffer)); } catch { /* ignore */ } },
          onError: (err) => console.error("[voice/stream] Pipeline error:", err?.message ?? err),
        }
      );
      if (ws.readyState !== 1 || (callSid && activeByCallSid.get(callSid) !== ws)) { result.stop(); return; }
      pipeline = result;
    } catch (err) {
      ws.readyState === 1 && ws.close(1011, "Pipeline init error");
    }
  }

  initPipeline().catch(() => { ws.readyState === 1 && ws.close(1011, "Pipeline init rejected"); });

  ws.on("message", (data: Buffer | string) => {
    const chunk = parseMessageChunk(data);
    if (chunk && pipeline) pipeline.sendAudio(chunk);
  });

  ws.on("close", () => {
    clearInterval(silenceInterval); clearInterval(pingInterval);
    callSid && activeByCallSid.get(callSid) === ws && activeByCallSid.delete(callSid);
    pipeline?.stop();
  });
}
