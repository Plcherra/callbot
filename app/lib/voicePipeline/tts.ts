import { textToSpeech } from "../elevenlabs";
import type { VoicePipelineConfig, VoicePipelineCallbacks } from "./types";

export async function generateAndSendTts(
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
    try {
      const sentry = (globalThis as unknown as { Sentry?: { captureException?: (e: unknown) => void } }).Sentry;
      if (sentry?.captureException) sentry.captureException(err);
    } catch { /* ignore */ }
    callbacks.onError?.(error);
    if (!isFallback) {
      await generateAndSendTts("I'm sorry, I'm having trouble. Please try again.", config, callbacks, true).catch(() => {});
    }
  }
}
