import { getPromptBase, VOICE_API_KEY } from "./constants";

export async function fetchPrompt(receptionistId: string): Promise<{ prompt: string; greeting: string }> {
  const apiKey = VOICE_API_KEY;
  if (!apiKey) return { prompt: "You are an AI receptionist. Be helpful and concise.", greeting: "Hello! Thanks for calling. How can I help you today?" };
  const base = getPromptBase().replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${base}/api/receptionist-prompt?receptionist_id=${receptionistId}`, {
      headers: { "x-voice-server-key": apiKey },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { prompt: "You are an AI receptionist. Be helpful and concise.", greeting: "Hello! Thanks for calling. How can I help you today?" };
    const json = (await res.json()) as { prompt?: string; greeting?: string };
    return { prompt: json.prompt ?? "You are an AI receptionist. Be helpful and concise.", greeting: json.greeting ?? "Hello! Thanks for calling. How can I help you today?" };
  } catch {
    clearTimeout(timeout);
    return { prompt: "You are an AI receptionist. Be helpful and concise.", greeting: "Hello! Thanks for calling. How can I help you today?" };
  }
}
