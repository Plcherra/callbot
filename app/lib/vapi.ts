const VAPI_BASE = "https://api.vapi.ai";

export type VapiAssistantConfig = {
  name: string;
  model: { provider: string; model: string };
  voice: { provider: string; voiceId: string };
  firstMessage?: string;
  systemPrompt?: string;
  phoneNumberId?: string;
  functions?: Array<{
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  }>;
};

export type VapiAssistant = {
  id: string;
  name: string;
  [key: string]: unknown;
};

async function vapiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vapi API error: ${res.status} ${err}`);
  }
  return res.json() as Promise<T>;
}

export async function createAssistant(
  config: VapiAssistantConfig
): Promise<VapiAssistant> {
  return vapiFetch<VapiAssistant>("/assistant", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export async function getAssistant(id: string): Promise<VapiAssistant> {
  return vapiFetch<VapiAssistant>(`/assistant/${id}`);
}

export async function updateAssistant(
  id: string,
  config: Partial<VapiAssistantConfig>
): Promise<VapiAssistant> {
  return vapiFetch<VapiAssistant>(`/assistant/${id}`, {
    method: "PATCH",
    body: JSON.stringify(config),
  });
}

export async function deleteAssistant(id: string): Promise<void> {
  await vapiFetch(`/assistant/${id}`, { method: "DELETE" });
}
