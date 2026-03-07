/**
 * Shared types for echodesk.
 */

/** Base receptionist shape used across list, detail, and settings views. */
export type Receptionist = {
  id: string;
  name: string;
  phone_number: string;
  calendar_id?: string | null;
  status: string;
  telnyx_phone_number_id?: string | null;
  telnyx_phone_number?: string | null;
  twilio_phone_number_sid?: string | null;
  twilio_phone_number?: string | null;
  inbound_phone_number?: string | null;
  website_url?: string | null;
  website_content?: string | null;
  website_content_updated_at?: string | null;
  extra_instructions?: string | null;
  payment_settings?: unknown;
  updated_at?: string;
};

/** Whether the receptionist has a callable number (inbound_phone_number set). */
export function hasCallableNumber(r: Pick<Receptionist, "inbound_phone_number">): boolean {
  return Boolean(r.inbound_phone_number?.trim());
}

/** Whether the receptionist uses Telnyx. */
export function usesTelnyx(r: Pick<Receptionist, "telnyx_phone_number_id">): boolean {
  return Boolean(r.telnyx_phone_number_id);
}

/** Whether the receptionist uses Twilio (legacy). */
export function usesTwilio(r: Pick<Receptionist, "twilio_phone_number_sid">): boolean {
  return Boolean(r.twilio_phone_number_sid);
}

/** Whether the receptionist has a provisioned number (Telnyx or legacy Twilio). */
export function hasProvisionedNumber(r: Pick<Receptionist, "telnyx_phone_number_id" | "twilio_phone_number_sid">): boolean {
  return usesTelnyx(r) || usesTwilio(r);
}

/** call_usage row shape. */
export type CallUsageRow = {
  id: string;
  receptionist_id: string;
  user_id?: string | null;
  call_sid?: string | null;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  transcript?: string | null;
  direction?: string | null;
  cost_cents?: number | null;
  billed_cents?: number | null;
  status?: string | null;
};
