/** E.164 regex: +[1-9] followed by 6-14 digits */
const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/**
 * Normalize a phone string to E.164 format.
 * Strips non-digits, assumes US/CA (+1) for 10-digit numbers.
 */
export function normalizeToE164(phone: string): string | null {
  const normalized = phone.replace(/\D/g, "");
  if (normalized.length < 10) return null;

  if (normalized.startsWith("1") && normalized.length === 11) {
    return `+${normalized}`;
  }
  if (normalized.length === 10) {
    return `+1${normalized}`;
  }
  return `+${normalized}`;
}

/**
 * Validate that a string is in E.164 format.
 */
export function isValidE164(phone: string): boolean {
  return E164_REGEX.test(phone);
}
