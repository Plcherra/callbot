/**
 * Grok (xAI) API client.
 * Uses OpenAI-compatible API at api.x.ai.
 */

const GROK_API = "https://api.x.ai/v1";

export type GrokMessage = { role: "system" | "user" | "assistant"; content: string };

export type GrokConfig = {
  apiKey: string;
  model?: string;
};

/**
 * Chat completion with Grok.
 */
export async function chat(
  messages: GrokMessage[],
  config: GrokConfig
): Promise<string> {
  const res = await fetch(`${GROK_API}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model ?? "grok-3-mini",
      messages,
      max_tokens: 256,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Grok API failed: ${err}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";
  return content.trim();
}
