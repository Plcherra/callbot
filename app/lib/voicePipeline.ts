/**
 * Voice pipeline: Deepgram STT → Grok LLM → ElevenLabs TTS.
 * Orchestrates the real-time call flow.
 */

import { createDeepgramLive, parseDeepgramMessage, type DeepgramTranscript } from "./deepgram";
import { chat, type GrokMessage } from "./grok";
import { textToSpeech } from "./elevenlabs";

const MAX_HISTORY = 20;

export type VoicePipelineConfig = {
  deepgramApiKey: string;
  grokApiKey: string;
  elevenlabsApiKey: string;
  elevenlabsVoiceId: string;
  systemPrompt: string;
  greeting?: string;
};

export type VoicePipelineCallbacks = {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onResponse?: (text: string) => void;
  onAudio?: (buffer: ArrayBuffer) => void;
  onError?: (err: Error) => void;
};

/**
 * Run the voice pipeline for one call.
 * Receives mulaw audio, sends back mulaw audio via callbacks.
 */
export async function runVoicePipeline(
  config: VoicePipelineConfig,
  callbacks: VoicePipelineCallbacks
): Promise<{
  sendAudio: (chunk: Buffer) => void;
  stop: () => void;
}> {
  const history: GrokMessage[] = [
    { role: "system", content: config.systemPrompt },
    ...(config.greeting
      ? [{ role: "assistant" as const, content: config.greeting }]
      : []),
  ];

  const dg = createDeepgramLive({
    apiKey: config.deepgramApiKey,
    encoding: "mulaw",
    sampleRate: 8000,
  });

  let pendingTranscript = "";
  let isProcessing = false;

  dg.on("open", () => {
    if (config.greeting) {
      generateAndSendTts(config.greeting, config, callbacks);
    }
  });

  dg.on("message", async (data: Buffer | string) => {
    const msg = parseDeepgramMessage(
      typeof data === "string" ? data : data.toString("utf8")
    ) as DeepgramTranscript | null;
    if (!msg?.channel?.alternatives?.[0]) return;

    const transcript = msg.channel.alternatives[0].transcript?.trim() ?? "";
    const isFinal = msg.is_final === true;

    callbacks.onTranscript?.(transcript, isFinal);

    if (!transcript) return;

    if (isFinal) {
      pendingTranscript = transcript;
      if (!isProcessing) {
        processUserInput();
      }
    }
  });

  dg.on("error", (err) => {
    callbacks.onError?.(err as Error);
  });

  async function processUserInput() {
    const userText = pendingTranscript;
    pendingTranscript = "";
    if (!userText) return;

    isProcessing = true;
    try {
      history.push({ role: "user", content: userText });
      if (history.length > MAX_HISTORY + 2) {
        history.splice(2, history.length - MAX_HISTORY - 2);
      }

      const response = await chat(history, { apiKey: config.grokApiKey });
      history.push({ role: "assistant", content: response });
      callbacks.onResponse?.(response);

      await generateAndSendTts(response, config, callbacks);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[voicePipeline] LLM/TTS error:", error.message, error.stack);
      try {
        const sentry = (globalThis as unknown as { Sentry?: { captureException?: (e: unknown) => void } }).Sentry;
        if (sentry?.captureException) sentry.captureException(err);
      } catch {
        // Sentry not available
      }
      callbacks.onError?.(error);
      const fallback = "I'm sorry, I didn't catch that. Could you repeat that?";
      await generateAndSendTts(fallback, config, callbacks);
    } finally {
      isProcessing = false;
      if (pendingTranscript) processUserInput();
    }
  }

  return {
    sendAudio: (chunk: Buffer) => {
      if (dg.readyState === 1) dg.send(chunk);
    },
    stop: () => dg.close(),
  };
}

async function generateAndSendTts(
  text: string,
  config: VoicePipelineConfig,
  callbacks: VoicePipelineCallbacks,
  isFallback = false
): Promise<void> {
  if (!text?.trim()) return;
  try {
    const buffer = await textToSpeech(text, {
      apiKey: config.elevenlabsApiKey,
      voiceId: config.elevenlabsVoiceId,
      outputFormat: "ulaw_8000",
    });
    callbacks.onAudio?.(buffer);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("[voicePipeline] TTS failed:", error.message);
    try {
      const sentry = (globalThis as unknown as { Sentry?: { captureException?: (e: unknown) => void } }).Sentry;
      if (sentry?.captureException) sentry.captureException(err);
    } catch {
      // Sentry not available
    }
    callbacks.onError?.(error);
    if (!isFallback) {
      await generateAndSendTts("I'm sorry, I'm having trouble. Please try again.", config, callbacks, true).catch(() => {
        console.error("[voicePipeline] Fallback TTS also failed");
      });
    }
  }
}
