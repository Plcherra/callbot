"use server";

import { createClient } from "@/app/lib/supabase/server";
import { assertReceptionistOwnership } from "@/app/actions/receptionistOwnership";

export type PaymentSettings = {
  accept_deposit?: boolean;
  deposit_amount_cents?: number;
  payment_methods?: string[];
  refund_policy?: string;
};

export type ReceptionistRow = {
  id: string;
  name: string;
  phone_number: string;
  calendar_id: string | null;
  status: string;
  payment_settings: PaymentSettings | null;
  updated_at: string;
  vapi_assistant_id: string | null;
  website_url?: string | null;
  website_content?: string | null;
  website_content_updated_at?: string | null;
  extra_instructions?: string | null;
};

export async function getReceptionist(
  receptionistId: string
): Promise<{ data: ReceptionistRow } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("receptionists")
    .select("id, name, phone_number, calendar_id, status, payment_settings, updated_at, vapi_assistant_id, website_url, website_content, website_content_updated_at, extra_instructions")
    .eq("id", receptionistId)
    .single();
  if (error) return { error: error.message };
  if (!data) return { error: "Receptionist not found." };
  return { data: data as ReceptionistRow };
}

export async function updatePaymentSettings(
  receptionistId: string,
  settings: PaymentSettings
): Promise<{ ok: true } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("receptionists")
    .update({
      payment_settings: settings,
      updated_at: new Date().toISOString(),
    })
    .eq("id", receptionistId);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function updateExtraInstructions(
  receptionistId: string,
  extraInstructions: string | null
): Promise<{ ok: true } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("receptionists")
    .update({
      extra_instructions: extraInstructions?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", receptionistId);
  if (error) return { error: error.message };
  return { ok: true };
}
