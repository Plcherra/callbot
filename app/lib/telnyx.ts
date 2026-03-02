/**
 * Telnyx client for phone number provisioning and call control.
 * Replaces Twilio for all telephony.
 */

const TELNYX_API_BASE = "https://api.telnyx.com/v2";

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

/**
 * Search for available local numbers and order one.
 * Returns the phone number record ID and E.164 number.
 */
export async function provisionNumber(areaCode: string): Promise<ProvisionedNumber> {
  const apiKey = getApiKey();
  const searchRes = await fetch(
    `${TELNYX_API_BASE}/available_phone_numbers?filter[country_code]=US&filter[number_type]=local&filter[features][]=voice&filter[locality]=${encodeURIComponent(areaCode)}&page[size]=1`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  );
  if (!searchRes.ok) {
    const err = await searchRes.text();
    throw new Error(`Telnyx search failed: ${err}`);
  }
  const searchData = (await searchRes.json()) as { data?: { phone_number?: string }[] };
  const numbers = searchData.data ?? [];
  if (numbers.length === 0) {
    throw new Error(`No available phone numbers in area code ${areaCode}`);
  }
  const phoneNumber = numbers[0]?.phone_number;
  if (!phoneNumber) {
    throw new Error("Telnyx returned no phone number");
  }

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
    throw new Error(`Telnyx order failed: ${err}`);
  }
  const orderData = (await orderRes.json()) as { data?: { id?: string; phone_number?: string } };
  const id = orderData.data?.id;
  const num = orderData.data?.phone_number ?? phoneNumber;
  if (!id) {
    throw new Error("Telnyx order returned no id");
  }
  return { id, phoneNumber: num };
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
    throw new Error(`Telnyx configure voice failed: ${err}`);
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
    throw new Error(`Telnyx create call failed: ${err}`);
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
    throw new Error(`Telnyx release failed: ${err}`);
  }
}
