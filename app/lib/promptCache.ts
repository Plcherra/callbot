/**
 * In-memory cache for receptionist prompts, keyed by call_control_id.
 * Populated by webhook before Telnyx connects; consumed by voiceStreamHandler.
 * Avoids blocking fetch during WebSocket connection (prevents 1006 timeout).
 * Uses globalThis so webhook (Next.js) and voiceStreamHandler (server) share the same Map.
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

type CachedPrompt = { prompt: string; greeting: string; at: number };

const g = globalThis as unknown as { __promptCache?: Map<string, CachedPrompt> };
const cache = g.__promptCache ?? (g.__promptCache = new Map<string, CachedPrompt>());

export function setPrompt(callSid: string, prompt: string, greeting: string): void {
  cache.set(callSid, { prompt, greeting, at: Date.now() });
}

export function getPrompt(callSid: string): { prompt: string; greeting: string } | null {
  const entry = cache.get(callSid);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(callSid);
    return null;
  }
  return { prompt: entry.prompt, greeting: entry.greeting };
}

export function deletePrompt(callSid: string): void {
  cache.delete(callSid);
}
