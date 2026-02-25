/**
 * Builds the system prompt for a receptionist from DB data.
 * Used by the voice server and for preview in settings.
 * Level 2: Structured sections for identity, tone, tool usage, business knowledge,
 * clarification/error recovery, and booking flow.
 */

const MAX_PROMPT_CHARS = 28000; // ~7k tokens at ~4 chars/token; leave headroom
const COMPACT_SERVICES_LIMIT = 10;
const COMPACT_STAFF_LIMIT = 15;

/** Tone presets for consistent voice; optional, falls back to "warm" if not set */
const TONE_GUIDANCE: Record<string, string> = {
  professional:
    "Use a professional, polished tone. Be courteous and efficient. Avoid slang.",
  warm: "Be warm, friendly, and personable. Use a welcoming tone while staying concise.",
  casual:
    "Keep it conversational and relaxed. You can use a slightly informal tone when appropriate.",
  formal:
    "Use formal language and titles. Be highly polite and structured.",
};

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
  websiteContent?: string | null;
  extraInstructions?: string | null;
  /** Optional tone: professional | warm | casual | formal */
  tone?: string | null;
  /** Optional business type for context, e.g. salon, clinic, cleaning */
  businessType?: string | null;
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
    websiteContent,
    extraInstructions,
    tone,
    businessType,
    compact = false,
  } = params;

  const sections: string[] = [];

  // --- 1. Identity and consent ---
  const recordingNotice =
    "This call may be recorded for quality and training purposes. By continuing, the caller consents to recording. ";
  sections.push(
    `${recordingNotice}You are an AI receptionist named ${name}. You represent this business on the phone. The business phone number is ${phoneNumber}.`
  );

  // --- 1b. Conversation memory ---
  sections.push(
    "Conversation memory: You have access to the full conversation history for this call. Use it: remember the caller's name, requested service, date/time discussed, and any details they shared. When they say 'actually make it 11am' or 'change that to Tuesday', refer back to the previous turn and update accordingly. Never ask for information they already gave."
  );

  // --- 2. Tone and style ---
  const toneKey = (tone ?? "warm").toLowerCase();
  const toneText =
    TONE_GUIDANCE[toneKey] ??
    TONE_GUIDANCE.warm;
  const businessContext = businessType?.trim()
    ? ` This is a ${businessType.trim()} business.`
    : "";
  sections.push(
    `Tone and style: ${toneText}${businessContext} Keep responses short (2–4 sentences) for natural phone conversation. Be empathetic and clear. Avoid jargon. If the caller seems confused, slow down and rephrase.`
  );

  // --- 3. Tool usage (calendar) ---
  sections.push(
    `Calendar and booking: The business calendar ID is ${calendarId}. You have access to tools to check availability, create appointments, and reschedule. When the caller wants to book, reschedule, or check availability, you MUST use these tools—never invent times or slots. Always confirm the details (service, date, time, name/contact) before creating or changing an appointment. After a tool returns results (e.g. available slots or a booking confirmation), summarize clearly for the caller. If a tool returns an error or "slot_unavailable", offer the suggested alternatives from the response and do not make up times.`
  );

  // --- 4. Business knowledge ---
  if (websiteContent?.trim()) {
    sections.push(
      `About the business (from website):\n${websiteContent.trim()}`
    );
  }

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
        return spec
          ? `${s.name} (${s.role ?? "staff"}): ${spec}`
          : `${s.name}${s.role ? `, ${s.role}` : ""}`;
      })
      .join(". ");
    sections.push(
      `Staff: ${list}. When relevant, suggest booking with a specific staff member or "anyone available."`
    );
  }

  if (services.length > 0) {
    const list = (compact ? services.slice(0, COMPACT_SERVICES_LIMIT) : services)
      .map(
        (s) =>
          `${s.name}: $${(s.price_cents / 100).toFixed(2)}${s.duration_minutes > 0 ? `, ${s.duration_minutes} min` : ""}${s.description && !compact ? ` (${s.description})` : ""}`
      )
      .join("; ");
    sections.push(
      `Services and pricing: ${list}. Quote prices and duration when asked.`
    );
  }

  if (locations.length > 0) {
    const list = locations
      .map((l) =>
        l.address
          ? `${l.name} at ${l.address}${l.notes ? ` (${l.notes})` : ""}`
          : l.name
      )
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

  // --- 5. Clarification and error recovery ---
  sections.push(
    `Clarification and recovery: If the caller does not give enough information to book (e.g. missing date, time, service, or name), ask for the missing piece politely—one thing at a time. Never guess or invent details. If you did not hear clearly, say: "I'm sorry, I didn't catch that. Could you repeat that for me?" or "Sorry, could you say that again?" If a tool or calendar fails, tell the caller calmly: "I'm having trouble with the calendar right now. Please try again in a moment, or leave your number and we'll call you back." Do not expose technical errors. For angry or frustrated callers, acknowledge their frustration first: "I understand this is frustrating. Let me help you with that."`
  );

  // --- 6. Booking flow ---
  sections.push(
    `Booking flow: (1) Confirm what they want (e.g. which service). (2) Get date and time (or offer to check availability). (3) Get their name and optionally phone for the appointment. (4) Summarize: "[Service] on [date] at [time] for [name]. Is that right?" (5) Use the create_appointment tool. (6) Confirm success and say what happens next (e.g. reminder, payment link). For rescheduling, use the reschedule_appointment tool with the new time; if they don't specify which appointment, ask. When check_availability returns free_slots, present 2–3 options clearly: "I have 10am, 2pm, or 4pm available. Which works best?" When create_appointment returns slot_unavailable with suggested_slots, offer those alternatives—never invent times.`
  );

  if (extraInstructions?.trim()) {
    sections.push(
      `Additional instructions from the business:\n${extraInstructions.trim()}`
    );
  }

  const full = sections.join("\n\n");
  if (full.length > MAX_PROMPT_CHARS) {
    return (
      full.slice(0, MAX_PROMPT_CHARS) +
      "\n\n[Prompt truncated for length. Consider using compact mode or fewer items.]"
    );
  }
  return full;
}
