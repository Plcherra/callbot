/**
 * Twilio webhook request validation.
 * Validates X-Twilio-Signature to ensure requests come from Twilio.
 * @see https://www.twilio.com/docs/usage/security#validating-requests
 */

import twilio from "twilio";
import { isPlaceholderUrl } from "@/app/lib/urlUtils";

/**
 * Parse form-urlencoded body into params object for validation.
 * FormData.get can return File for file uploads; we only expect strings from Twilio.
 */
export function parseFormParams(rawBody: string): Record<string, string> {
  const params: Record<string, string> = {};
  const search = new URLSearchParams(rawBody);
  search.forEach((value, key) => {
    if (typeof value === "string") {
      params[key] = value;
    }
  });
  return params;
}

/**
 * Safely get a string param (FormData.get can return File).
 */
export function getStringParam(
  params: Record<string, string>,
  key: string
): string | null {
  const v = params[key];
  return typeof v === "string" ? v.trim() || null : null;
}

/**
 * Get the absolute webhook URL Twilio would have used.
 * Uses TWILIO_WEBHOOK_BASE_URL or NEXT_PUBLIC_APP_URL + path.
 */
function getWebhookUrl(path: string): string | null {
  const base =
    process.env.TWILIO_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!base?.trim() || isPlaceholderUrl(base)) {
    return null;
  }
  return `${base.replace(/\/$/, "")}${path}`;
}

/**
 * Validate that the request is from Twilio.
 * Returns true if valid, false otherwise.
 * Call before processing any Twilio webhook.
 */
export function validateTwilioRequest(
  _rawBody: string,
  signature: string | null,
  params: Record<string, string>,
  path: string
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken?.trim()) {
    return false;
  }
  if (!signature?.trim()) {
    return false;
  }
  const url = getWebhookUrl(path);
  if (!url) {
    return false;
  }
  return twilio.validateRequest(authToken, signature, url, params);
}
