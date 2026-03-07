import { createDeepgramLive, parseDeepgramMessage, type DeepgramTranscript } from "../deepgram";
import { chat, chatWithTools, type GrokMessage } from "../grok";
import { CALENDAR_TOOLS, callCalendarTool } from "../calendarTools";
import { generateAndSendTts } from "./tts";
import type { VoicePipelineConfig, VoicePipelineCallbacks } from "./types";

export type { VoicePipelineConfig, VoicePipelineCallbacks } from "./types";

const MAX_HISTORY = 20;

export async function runVoicePipeline(
  config: VoicePipelineConfig,
  callbacks: VoicePipelineCallbacks
): Promise<{ sendAudio: (chunk: Buffer) => void; stop: () => void }> {
  const history: GrokMessage[] = [
    { role: "system", content: config.systemPrompt },
    ...(config.greeting ? [{ role: "assistant" as const, content: config.greeting }] : []),
  ];

  const dg = createDeepgramLive({ apiKey: config.deepgramApiKey, encoding: "mulaw", sampleRate: 8000 });
  let pendingTranscript = "";
  let isProcessing = false;

  dg.on("open", () => { if (config.greeting) generateAndSendTts(config.greeting, config, callbacks); });
  dg.on("message", async (data: Buffer | string) => {
    const msg = parseDeepgramMessage(typeof data === "string" ? data : data.toString("utf8")) as DeepgramTranscript | null;
    if (!msg?.channel?.alternatives?.[0]) return;
    const transcript = msg.channel.alternatives[0].transcript?.trim() ?? "";
    const isFinal = msg.is_final === true;
    callbacks.onTranscript?.(transcript, isFinal);
    if (!transcript) return;
    if (isFinal) { pendingTranscript = transcript; if (!isProcessing) processUserInput(); }
  });
  dg.on("error", (err) => { callbacks.onError?.(err as Error); });

  async function processUserInput() {
    const userText = pendingTranscript; pendingTranscript = "";
    if (!userText) return;
    isProcessing = true;
    try {
      history.push({ role: "user", content: userText });
      if (history.length > MAX_HISTORY + 2) history.splice(2, history.length - MAX_HISTORY - 2);
      const useCalendarTools = config.receptionistId && config.voiceServerApiKey && config.voiceServerBaseUrl;
      let response: string;
      if (useCalendarTools) {
        const calendarParams = { baseUrl: config.voiceServerBaseUrl!, apiKey: config.voiceServerApiKey!, receptionistId: config.receptionistId! };
        response = await chatWithTools(history, CALENDAR_TOOLS, async (name, args) => {
          if (name === "check_availability" || name === "create_appointment" || name === "reschedule_appointment") {
            return callCalendarTool(calendarParams, name, args);
          }
          return JSON.stringify({ success: false, error: `Unknown tool: ${name}` });
        }, { apiKey: config.grokApiKey });
      } else {
        response = await chat(history, { apiKey: config.grokApiKey });
      }
      history.push({ role: "assistant", content: response });
      callbacks.onResponse?.(response);
      await generateAndSendTts(response, config, callbacks);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      try { (globalThis as unknown as { Sentry?: { captureException?: (e: unknown) => void } }).Sentry?.captureException?.(err); } catch { /* ignore */ }
      callbacks.onError?.(error);
      await generateAndSendTts("I'm sorry, I didn't catch that. Could you repeat that?", config, callbacks);
    } finally {
      isProcessing = false;
      if (pendingTranscript) processUserInput();
    }
  }

  return {
    sendAudio: (chunk: Buffer) => { if (dg.readyState === 1) dg.send(chunk); },
    stop: () => dg.close(),
  };
}
