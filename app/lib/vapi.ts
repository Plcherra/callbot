const VAPI_BASE = "https://api.vapi.ai";

export type VapiAssistantConfig = {
  name: string;
  model: {
    provider: string;
    model: string;
    messages?: Array<{ role: string; content: string }>;
    toolIds?: string[];
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
  serverUrl?: string;
};

export type VapiAssistant = {
  id: string;
  name: string;
  [key: string]: unknown;
};

const isDev = process.env.NODE_ENV === "development";

async function vapiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (isDev && options.body) {
    try {
      const payload = JSON.parse(options.body as string) as Record<string, unknown>;
      const hasSystemPrompt = "systemPrompt" in payload;
      console.log("[Vapi] Request", path, {
        hasSystemPrompt: hasSystemPrompt ? "INVALID (should be false)" : "ok",
        hasModelMessages: Boolean(payload.model && typeof payload.model === "object" && "messages" in (payload.model as object)),
      });
      if (hasSystemPrompt) {
        console.warn("[Vapi] Payload should not contain top-level systemPrompt; use model.messages instead.");
      }
    } catch {
      // ignore parse errors for non-JSON body
    }
  }
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
  if (model.toolIds?.length) {
    modelConfig.toolIds = model.toolIds;
  }

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

  const payload: Record<string, unknown> = {
    ...rest,
    model: modelConfig,
  };
  if (config.serverUrl) {
    payload.server = { url: config.serverUrl };
  }
  return payload;
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

export type VapiTool = { id: string; type: string; [key: string]: unknown };

/**
 * Create a tool via Vapi API. Used for Google Calendar and other tool types.
 */
export async function createTool(body: Record<string, unknown>): Promise<VapiTool> {
  return vapiFetch<VapiTool>("/tool", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const DEFAULT_CALENDAR_TIMEZONE = "America/New_York";

/**
 * Create Google Calendar check-availability and create-event tools for the given calendar.
 * Returns [availabilityToolId, createEventToolId]. Requires Google Calendar connected in Vapi Dashboard.
 */
export async function createGoogleCalendarTools(
  calendarId: string,
  timeZone?: string
): Promise<[string, string]> {
  const tz = timeZone?.trim() || process.env.VAPI_CALENDAR_TIMEZONE || DEFAULT_CALENDAR_TIMEZONE;

  const availability = await createTool({
    type: "google.calendar.availability.check",
    name: "checkCalendarAvailability",
    description: "Use this tool to check calendar availability before booking. Call it to see available slots.",
    calendarId: calendarId.trim(),
    timeZone: tz,
  });

  const createEvent = await createTool({
    type: "google.calendar.event.create",
    name: "createCalendarEvent",
    description: "Use this tool to schedule appointments and create calendar events. Use after checking availability.",
    calendarId: calendarId.trim(),
    timeZone: tz,
  });

  return [availability.id, createEvent.id];
}
