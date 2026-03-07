export const SILENCE_PACKET = Buffer.alloc(160, 0xff);
export const SILENCE_INTERVAL_MS = 3000;
export const PING_INTERVAL_MS = 10000;
export function getPromptBase(): string {
  const PORT = process.env.PORT || "3000";
  return process.env.VOICE_PROMPT_BASE_URL || `http://127.0.0.1:${PORT}`;
}

export const VOICE_API_KEY = process.env.VOICE_SERVER_API_KEY;
