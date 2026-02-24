/**
 * URL validation helpers.
 * Shared across Twilio provisioning, webhooks, and voice routes.
 */

/** Detect placeholder or invalid webhook URLs */
export function isPlaceholderUrl(value: string): boolean {
  return /your-app\.com|your-domain\.com/i.test(value);
}
