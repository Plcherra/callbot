/**
 * ElevenLabs TTS client (multilingual v2).
 * Uses REST API for text-to-speech; outputs can be streamed.
 */

const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

export type ElevenLabsConfig = {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  outputFormat?: string;
};

/**
 * Convert text to speech and return audio as ArrayBuffer.
 * outputFormat "ulaw_8000" returns mulaw 8kHz for telephony (Telnyx/Twilio).
 */
export async function textToSpeech(
  text: string,
  config: ElevenLabsConfig
): Promise<ArrayBuffer> {
  const modelId = config.modelId ?? "eleven_multilingual_v2";
  const outputFormat = config.outputFormat ?? "ulaw_8000";
  const url = `${ELEVENLABS_API}/text-to-speech/${config.voiceId}?output_format=${outputFormat}`;

  const body: Record<string, unknown> = {
    text,
    model_id: modelId,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": config.apiKey,
      "Content-Type": "application/json",
      Accept: "audio/basic",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs TTS failed: ${err}`);
  }

  return res.arrayBuffer();
}
