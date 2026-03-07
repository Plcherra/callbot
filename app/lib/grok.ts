/**
 * Grok (xAI) API client.
 * Uses OpenAI-compatible API at api.x.ai.
 * Supports function calling for calendar and other tools.
 */

const GROK_API = "https://api.x.ai/v1";

export type GrokMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

export type GrokConfig = {
  apiKey: string;
  model?: string;
};

export type GrokTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description?: string; items?: { type: string } }>;
      required?: string[];
    };
  };
};

export type ToolExecutor = (
  name: string,
  args: Record<string, unknown>
) => Promise<string | { success: boolean; error?: string; [k: string]: unknown }>;

const MAX_TOOL_ROUNDS = 5;

/**
 * Chat completion with Grok (no tools).
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
      messages: messages.map((m) => ({ role: m.role, content: (m as { content?: string }).content ?? "" })),
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

/**
 * Chat with function calling. Executes tools and loops until a final text response.
 */
export async function chatWithTools(
  messages: GrokMessage[],
  tools: GrokTool[],
  toolExecutor: ToolExecutor,
  config: GrokConfig
): Promise<string> {
  const history = [...messages];
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(`${GROK_API}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model ?? "grok-3-mini",
        messages: history.map((m) => {
          if ("tool_calls" in m && m.tool_calls && m.tool_calls.length > 0) {
            return {
              role: "assistant",
              content: m.content ?? null,
              tool_calls: m.tool_calls.map((tc) => ({
                id: tc.id,
                type: "function",
                function: { name: tc.function.name, arguments: tc.function.arguments },
              })),
            };
          }
          return { role: m.role, content: (m as { content?: string }).content ?? "" };
        }),
        tools,
        tool_choice: "auto",
        max_tokens: 512,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Grok API failed: ${err}`);
    }

    const data = (await res.json()) as {
      choices?: {
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            type: "function";
            function: { name: string; arguments: string };
          }>;
        };
      }[];
    };

    const msg = data.choices?.[0]?.message;
    if (!msg) return "";

    const toolCalls = msg.tool_calls;
    if (!toolCalls?.length) {
      const content = msg.content ?? "";
      return typeof content === "string" ? content.trim() : "";
    }

    history.push({
      role: "assistant",
      content: msg.content ?? null,
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        args = {};
      }
      try {
        const result = await toolExecutor(tc.function.name, args);
        const content =
          typeof result === "string" ? result : JSON.stringify(result);
        history.push({
          role: "tool",
          tool_call_id: tc.id,
          content,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        history.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ success: false, error: errMsg }),
        });
      }
    }
  }

  return "I'm sorry, I'm having trouble with that. Could you try again?";
}
