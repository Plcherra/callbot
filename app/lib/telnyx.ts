/**
 * Telnyx client for phone number provisioning and call control.
 * Replaces Twilio for all telephony.
 */

const TELNYX_API_BASE = "https://api.telnyx.com/v2";

/**
 * Parse Telnyx API error response. Avoids exposing raw HTML to users.
 */
function parseTelnyxError(raw: string, context: string): string {
  const trimmed = raw?.trim() || "";
  if (!trimmed) return `Telnyx ${context} failed. Please try again.`;
  if (trimmed.startsWith("<") || trimmed.toLowerCase().includes("<!doctype")) {
    return `Telnyx ${context} failed. Check your API key and Connection ID, then try again.`;
  }
  try {
    const json = JSON.parse(trimmed) as { errors?: Array<{ detail?: string; title?: string }> };
    const first = json.errors?.[0];
    if (first?.detail) return first.detail;
    if (first?.title) return first.title;
  } catch {
    /* not JSON */
  }
  const noHtml = trimmed.replace(/<[^>]*>/g, "").trim();
  if (noHtml.length > 200) return noHtml.slice(0, 200) + "...";
  return noHtml || `Telnyx ${context} failed. Please try again.`;
}

function getApiKey(): string {
  const key = process.env.TELNYX_API_KEY;
  if (!key?.trim()) {
    throw new Error("TELNYX_API_KEY must be set");
  }
  return key;
}

export type ProvisionedNumber = {
  id: string;
  phoneNumber: string;
};

/** Fallback area codes when the requested one has no inventory */
const FALLBACK_AREA_CODES = ["212", "310", "415", "508", "781", "646", "202", "305", "702"];

async function tryProvisionInAreaCode(areaCode: string, apiKey: string): Promise<ProvisionedNumber | null> {
  const searchRes = await fetch(
    `${TELNYX_API_BASE}/available_phone_numbers?filter[country_code]=US&filter[number_type]=local&filter[features][]=voice&filter[locality]=${encodeURIComponent(areaCode)}&page[size]=1`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  if (!searchRes.ok) {
    const err = await searchRes.text();
    throw new Error(parseTelnyxError(err, "search"));
  }
  const searchData = (await searchRes.json()) as { data?: { phone_number?: string }[] };
  const numbers = searchData.data ?? [];
  if (numbers.length === 0) return null;
  const phoneNumber = numbers[0]?.phone_number;
  if (!phoneNumber) return null;

  const orderRes = await fetch(`${TELNYX_API_BASE}/phone_numbers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ phone_number: phoneNumber }),
  });
  if (!orderRes.ok) {
    const err = await orderRes.text();
    throw new Error(parseTelnyxError(err, "order"));
  }
  const orderData = (await orderRes.json()) as { data?: { id?: string; phone_number?: string } };
  const id = orderData.data?.id;
  const num = orderData.data?.phone_number ?? phoneNumber;
  if (!id) return null;
  return { id, phoneNumber: num };
}

/**
 * Search for available local numbers and order one.
 * If the requested area code has no inventory, tries fallback area codes.
 * Returns the phone number record ID and E.164 number.
 */
export async function provisionNumber(areaCode: string): Promise<ProvisionedNumber> {
  const apiKey = getApiKey();
  const toTry = [areaCode, ...FALLBACK_AREA_CODES.filter((ac) => ac !== areaCode)];

  for (const ac of toTry) {
    const result = await tryProvisionInAreaCode(ac, apiKey);
    if (result) return result;
  }

  throw new Error(`No available phone numbers in area code ${areaCode} or common fallbacks. Try bringing your own number.`);
}

/**
 * Configure the voice URL for a Telnyx number (Connection/Messaging Profile).
 * Voice URL receives call.initiated webhooks.
 */
export async function configureVoiceUrl(
  phoneNumberId: string,
  webhookUrl: string
): Promise<void> {
  const apiKey = getApiKey();
  const res = await fetch(`${TELNYX_API_BASE}/phone_numbers/${phoneNumberId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      connection_id: process.env.TELNYX_CONNECTION_ID || undefined,
      webhook_url: webhookUrl,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    const msg = parseTelnyxError(err, "configure voice");
    throw new Error(msg);
  }
}

/**
 * Create an outbound call via Telnyx Call Control.
 * Requires TELNYX_CONNECTION_ID. Webhook receives call.initiated, call.answered, etc.
 */
export async function createOutboundCall(params: {
  from: string;
  to: string;
  webhookUrl: string;
}): Promise<{ call_control_id: string }> {
  const apiKey = getApiKey();
  const connectionId = process.env.TELNYX_CONNECTION_ID;
  if (!connectionId?.trim()) {
    throw new Error("TELNYX_CONNECTION_ID required for outbound calls");
  }
  const res = await fetch(`${TELNYX_API_BASE}/calls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      connection_id: connectionId,
      to: params.to,
      from: params.from,
      webhook_url: params.webhookUrl,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    const msg = parseTelnyxError(err, "create call");
    throw new Error(msg);
  }
  const data = (await res.json()) as { data?: { call_control_id?: string } };
  const id = data.data?.call_control_id;
  if (!id) throw new Error("Telnyx create call returned no call_control_id");
  return { call_control_id: id };
}

/**
 * Release (delete) a Telnyx phone number.
 */
export async function releaseNumber(phoneNumberId: string): Promise<void> {
  const apiKey = getApiKey();
  const res = await fetch(`${TELNYX_API_BASE}/phone_numbers/${phoneNumberId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok && res.status !== 404) {
    const err = await res.text();
    const msg = parseTelnyxError(err, "release");
    throw new Error(msg);
  }
}
