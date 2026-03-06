/**
 * Centralized env access with fallbacks.
 */

export function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function getTelnyxWebhookBase(): string {
  return (
    process.env.TELNYX_WEBHOOK_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://echodesk.us"
  ).replace(/\/$/, "");
}

export function getTelnyxWsBase(): string {
  return getTelnyxWebhookBase().replace(/^https?/, "ws");
}
