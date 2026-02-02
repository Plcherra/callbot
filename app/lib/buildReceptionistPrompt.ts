/**
 * Builds the system prompt for a receptionist's Vapi assistant from DB data.
 * Used when creating/updating the assistant and for "Apply to Vapi" in settings.
 */

const MAX_PROMPT_CHARS = 28000; // ~7k tokens at ~4 chars/token; leave headroom
const COMPACT_SERVICES_LIMIT = 10;
const COMPACT_STAFF_LIMIT = 15;

export type BuildPromptParams = {
  name: string;
  phoneNumber: string;
  calendarId: string;
  staff: Array<{ name: string; role: string | null; specialties: unknown }>;
  services: Array<{
    name: string;
    description: string | null;
    price_cents: number;
    duration_minutes: number;
    category: string | null;
  }>;
  locations: Array<{ name: string; address: string | null; notes: string | null }>;
  promos: Array<{
    description: string;
    code: string;
    discount_type: string | null;
    discount_value: number | null;
  }>;
  reminderRules: Array<{ type: string; content: string }>;
  paymentSettings?: {
    accept_deposit?: boolean;
    deposit_amount_cents?: number;
    payment_methods?: string[];
    refund_policy?: string;
  } | null;
  compact?: boolean;
};

export function buildReceptionistPrompt(params: BuildPromptParams): string {
  const {
    name,
    phoneNumber,
    calendarId,
    staff,
    services,
    locations,
    promos,
    reminderRules,
    paymentSettings,
    compact = false,
  } = params;

  let base = `You are an AI receptionist named ${name}. You answer calls professionally and help callers book appointments. The business phone number is ${phoneNumber}. You have access to the business Google Calendar (calendar ID: ${calendarId}) to check availability and create events. Be friendly, concise, and confirm the appointment details before ending the call.`;

  const sections: string[] = [];

  if (staff.length > 0) {
    const list = (compact ? staff.slice(0, COMPACT_STAFF_LIMIT) : staff)
      .map((s) => {
        const spec = s.specialties
          ? typeof s.specialties === "string"
            ? s.specialties
            : Array.isArray(s.specialties)
              ? (s.specialties as string[]).join(", ")
              : ""
          : "";
        return spec ? `${s.name} (${s.role ?? "staff"}): ${spec}` : `${s.name}${s.role ? `, ${s.role}` : ""}`;
      })
      .join(". ");
    sections.push(`Staff: ${list}. When relevant, suggest booking with a specific staff member or "anyone available."`);
  }

  if (services.length > 0) {
    const list = (compact ? services.slice(0, COMPACT_SERVICES_LIMIT) : services)
      .map(
        (s) =>
          `${s.name}: $${(s.price_cents / 100).toFixed(2)}${s.duration_minutes > 0 ? `, ${s.duration_minutes} min` : ""}${s.description && !compact ? ` (${s.description})` : ""}`
      )
      .join("; ");
    sections.push(`Services: ${list}. Quote prices and duration when asked.`);
  }

  if (locations.length > 0) {
    const list = locations
      .map((l) => (l.address ? `${l.name} at ${l.address}${l.notes ? ` (${l.notes})` : ""}` : l.name))
      .join(". ");
    sections.push(`Locations: ${list}.`);
  }

  if (paymentSettings) {
    const parts: string[] = [];
    if (paymentSettings.payment_methods?.length) {
      parts.push(`Accepted: ${paymentSettings.payment_methods.join(", ")}.`);
    }
    if (paymentSettings.accept_deposit && paymentSettings.deposit_amount_cents) {
      parts.push(
        `Deposit to secure booking: $${(paymentSettings.deposit_amount_cents / 100).toFixed(2)}.`
      );
    }
    parts.push(
      "Tell callers you'll send a secure payment link via text after you confirm their booking."
    );
    if (paymentSettings.refund_policy) {
      parts.push(`Refund policy: ${paymentSettings.refund_policy}`);
    }
    sections.push(`Payment: ${parts.join(" ")}`);
  }

  if (reminderRules.length > 0) {
    const rules = reminderRules.map((r) => r.content).join(". ");
    sections.push(`Policies and rules: ${rules}`);
  }

  if (promos.length > 0) {
    const list = promos
      .map(
        (p) =>
          `${p.code}: ${p.description}${p.discount_value != null ? ` (${p.discount_value}${p.discount_type === "percent" ? "%" : ""} off)` : ""}`
      )
      .join("; ");
    sections.push(`Current promos: ${list}.`);
  }

  const full = sections.length > 0 ? `${base}\n\n${sections.join("\n\n")}` : base;
  if (full.length > MAX_PROMPT_CHARS) {
    return full.slice(0, MAX_PROMPT_CHARS) + "\n\n[Prompt truncated for length. Consider using compact mode or fewer items.]";
  }
  return full;
}
