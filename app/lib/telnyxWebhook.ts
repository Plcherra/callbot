/**
 * Telnyx webhook signature validation.
 * Supports TELNYX_PUBLIC_KEY (RSA) or TELNYX_WEBHOOK_SECRET (HMAC).
 * @see https://developers.telnyx.com/docs/v2/signature-validation
 */

import * as crypto from "crypto";

export function validateTelnyxWebhook(
  payload: string,
  signature: string | null,
  options?: { publicKey?: string; webhookSecret?: string }
): boolean {
  if (!signature?.trim()) return false;

  if (options?.webhookSecret?.trim()) {
    const expected = crypto.createHmac("sha256", options.webhookSecret).update(payload).digest("hex");
    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expected, "hex");
    return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  }

  const publicKey = options?.publicKey ?? process.env.TELNYX_PUBLIC_KEY;
  if (publicKey?.trim()) {
    try {
      const verifier = crypto.createVerify("sha256");
      verifier.update(payload);
      const key = publicKey.includes("BEGIN") ? publicKey : `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;
      return verifier.verify(key, signature, "base64");
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Parse Telnyx webhook event payload.
 */
export function parseTelnyxEvent(payload: string): { event_type: string; data: unknown } | null {
  try {
    return JSON.parse(payload) as { event_type: string; data: unknown };
  } catch {
    return null;
  }
}
