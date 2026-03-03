"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
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
  website_url?: string | null;
  website_content?: string | null;
  website_content_updated_at?: string | null;
  extra_instructions?: string | null;
};

export async function getReceptionist(
  receptionistId: string,
  supabaseParam?: SupabaseClient
): Promise<{ data: ReceptionistRow } | { error: string }> {
  const supabase = supabaseParam ?? (await createClient());
  const ownership = await assertReceptionistOwnership(receptionistId, supabase);
  if (!ownership.ok) return { error: ownership.error };
  const { data, error } = await supabase
    .from("receptionists")
    .select("id, name, phone_number, calendar_id, status, payment_settings, updated_at, website_url, website_content, website_content_updated_at, extra_instructions")
    .eq("id", receptionistId)
    .single();
  if (error) return { error: error.message };
  if (!data) return { error: "Receptionist not found." };
  return { data: data as ReceptionistRow };
}

export async function updatePaymentSettings(
  receptionistId: string,
  settings: PaymentSettings,
  supabaseParam?: SupabaseClient
): Promise<{ ok: true } | { error: string }> {
  const supabase = supabaseParam ?? (await createClient());
  const ownership = await assertReceptionistOwnership(receptionistId, supabase);
  if (!ownership.ok) return { error: ownership.error };
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
  extraInstructions: string | null,
  supabaseParam?: SupabaseClient
): Promise<{ ok: true } | { error: string }> {
  const supabase = supabaseParam ?? (await createClient());
  const ownership = await assertReceptionistOwnership(receptionistId, supabase);
  if (!ownership.ok) return { error: ownership.error };
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
