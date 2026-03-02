/**
 * Deepgram Real-time STT client.
 * Uses WebSocket for live streaming transcription.
 */

import WebSocket from "ws";

export type DeepgramTranscript = {
  channel?: { alternatives?: { transcript?: string; confidence?: number }[] };
  is_final?: boolean;
};

export type DeepgramConfig = {
  apiKey: string;
  sampleRate?: number;
  encoding?: string;
  language?: string;
};

const DEEPGRAM_WS = "wss://api.deepgram.com/v1/listen";

/**
 * Create a Deepgram live WebSocket connection.
 * Uses token in query string (Deepgram supports this for auth).
 */
export function createDeepgramLive(config: DeepgramConfig): WebSocket {
  const params = new URLSearchParams({
    encoding: config.encoding ?? "mulaw",
    sample_rate: String(config.sampleRate ?? 8000),
    channels: "1",
    punctuate: "true",
    interim_results: "true",
  });
  if (config.language) params.set("language", config.language);

  const url = `${DEEPGRAM_WS}?${params.toString()}`;
  return new WebSocket(url, {
    headers: { Authorization: `Token ${config.apiKey}` },
  } as WebSocket.ClientOptions);
}

/**
 * Parse Deepgram WebSocket message for transcript.
 */
export function parseDeepgramMessage(data: string | Buffer): DeepgramTranscript | null {
  try {
    const str = typeof data === "string" ? data : data.toString("utf8");
    return JSON.parse(str) as DeepgramTranscript;
  } catch {
    return null;
  }
}
