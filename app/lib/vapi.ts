const VAPI_BASE = "https://api.vapi.ai";

export type VapiAssistantConfig = {
  name: string;
  model: {
    provider: string;
    model: string;
    messages?: Array<{ role: string; content: string }>;
  };
  voice: { provider: string; voiceId: string };
  firstMessage?: string;
  systemPrompt?: string; // Deprecated: use model.messages instead. This will be converted automatically.
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

/**
 * Transforms a VapiAssistantConfig to the format expected by the Vapi API.
 * Converts systemPrompt to model.messages format.
 */
function transformConfig(config: VapiAssistantConfig): Record<string, unknown> {
  const { systemPrompt, model, ...rest } = config;
  
  // Build the model object
  const modelConfig: Record<string, unknown> = {
    provider: model.provider,
    model: model.model,
  };

  // If systemPrompt is provided, convert it to model.messages format
  if (systemPrompt) {
    modelConfig.messages = [
      {
        role: "system",
        content: systemPrompt,
      },
    ];
  } else if (model.messages) {
    // Use provided messages if no systemPrompt
    modelConfig.messages = model.messages;
  }

  return {
    ...rest,
    model: modelConfig,
  };
}

export async function createAssistant(
  config: VapiAssistantConfig
): Promise<VapiAssistant> {
  const transformedConfig = transformConfig(config);
  return vapiFetch<VapiAssistant>("/assistant", {
    method: "POST",
    body: JSON.stringify(transformedConfig),
  });
}

export async function getAssistant(id: string): Promise<VapiAssistant> {
  return vapiFetch<VapiAssistant>(`/assistant/${id}`);
}

export async function updateAssistant(
  id: string,
  config: Partial<VapiAssistantConfig>
): Promise<VapiAssistant> {
  // For updates, we need to handle partial configs
  const transformedConfig: Record<string, unknown> = {};
  
  // Handle model updates
  if (config.model || config.systemPrompt) {
    const modelConfig: Record<string, unknown> = {};
    
    if (config.model) {
      if (config.model.provider) modelConfig.provider = config.model.provider;
      if (config.model.model) modelConfig.model = config.model.model;
      if (config.model.messages) modelConfig.messages = config.model.messages;
    }
    
    // Convert systemPrompt to messages if provided (takes precedence)
    if (config.systemPrompt) {
      modelConfig.messages = [
        {
          role: "system",
          content: config.systemPrompt,
        },
      ];
    }
    
    // Only add model if we have something to update
    if (Object.keys(modelConfig).length > 0) {
      transformedConfig.model = modelConfig;
    }
  }
  
  // Copy other properties (excluding systemPrompt and model which we handled above)
  const { systemPrompt, model, ...rest } = config;
  Object.assign(transformedConfig, rest);
  
  return vapiFetch<VapiAssistant>(`/assistant/${id}`, {
    method: "PATCH",
    body: JSON.stringify(transformedConfig),
  });
}

export async function deleteAssistant(id: string): Promise<void> {
  await vapiFetch(`/assistant/${id}`, { method: "DELETE" });
}

export type VapiPhoneNumber = {
  id: string;
  number?: string;
  assistantId?: string;
  [key: string]: unknown;
};

/**
 * Create a free Vapi US phone number. Limit 10 per account.
 * See https://docs.vapi.ai/api-reference/phone-numbers/create and https://docs.vapi.ai/free-telephony
 */
export async function createPhoneNumber(options?: {
  areaCode?: string;
}): Promise<VapiPhoneNumber> {
  const body: Record<string, unknown> = {
    provider: "vapi",
  };
  if (options?.areaCode) {
    body.areaCode = options.areaCode;
  }
  return vapiFetch<VapiPhoneNumber>("/phone-number", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Attach a phone number to an assistant so inbound calls route to that assistant.
 */
export async function updatePhoneNumber(
  phoneNumberId: string,
  assistantId: string
): Promise<VapiPhoneNumber> {
  return vapiFetch<VapiPhoneNumber>(`/phone-number/${phoneNumberId}`, {
    method: "PATCH",
    body: JSON.stringify({ assistantId }),
  });
}

export async function deletePhoneNumber(phoneNumberId: string): Promise<void> {
  await vapiFetch(`/phone-number/${phoneNumberId}`, { method: "DELETE" });
}
