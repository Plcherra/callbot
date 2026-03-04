/**
 * Telnyx webhook signature validation.
 * Supports TELNYX_PUBLIC_KEY (Ed25519, API v2) or TELNYX_WEBHOOK_SECRET (HMAC, API v1).
 * @see https://developers.telnyx.com/docs/v2/signature-validation
 */

import * as crypto from "crypto";
import { TelnyxWebhook } from "telnyx";

export function validateTelnyxWebhook(
  payload: string,
  signature: string | null,
  options?: { publicKey?: string; webhookSecret?: string; headers?: Record<string, string> }
): boolean {
  const publicKey = (options?.publicKey ?? process.env.TELNYX_PUBLIC_KEY)?.trim();
  const webhookSecret = (options?.webhookSecret ?? process.env.TELNYX_WEBHOOK_SECRET)?.trim();
  const headers = options?.headers ?? {};

  const hasEd25519 = headers && Object.keys(headers).some((k) => k.toLowerCase() === "telnyx-signature-ed25519");
  if (publicKey && hasEd25519) {
    try {
      const webhook = new TelnyxWebhook(publicKey);
      webhook.verify(payload, headers);
      return true;
    } catch {
      return false;
    }
  }

  if (webhookSecret && signature?.trim()) {
    try {
      const expected = crypto.createHmac("sha256", webhookSecret).update(payload).digest("hex");
      const sigBuf = Buffer.from(signature, "hex");
      const expBuf = Buffer.from(expected, "hex");
      return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Parse Telnyx webhook event payload.
 * Handles both legacy format and Standard Webhooks format.
 * - Legacy: { event_type, data: { payload } }
 * - Alternative: { data: { event_type, payload } }
 */
export function parseTelnyxEvent(
  payload: string
): { event_type: string; data: { payload?: unknown; [k: string]: unknown } } | null {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    let eventType =
      (parsed.event_type as string) ??
      (parsed.data as Record<string, unknown>)?.event_type as string | undefined;
    let data = (parsed.data ?? parsed) as { payload?: unknown; [k: string]: unknown };

    if (!eventType && data?.payload && typeof data.payload === "object") {
      const inner = data.payload as Record<string, unknown>;
      eventType = inner.event_type as string | undefined;
      if (inner.payload) data = { ...data, payload: inner.payload };
    }

    if (!eventType || typeof eventType !== "string") return null;
    return { event_type: eventType, data };
  } catch {
    return null;
  }
}
