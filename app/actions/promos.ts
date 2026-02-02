"use server";

import { createClient } from "@/app/lib/supabase/server";
import { assertReceptionistOwnership } from "@/app/actions/receptionistOwnership";

export type PromoRow = {
  id: string;
  receptionist_id: string;
  description: string;
  code: string;
  eligibility: unknown;
  valid_from: string | null;
  valid_until: string | null;
  discount_type: string | null;
  discount_value: number | null;
  created_at: string;
  updated_at: string;
};

export async function listPromos(
  receptionistId: string
): Promise<{ data: PromoRow[] } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("promos")
    .select("*")
    .eq("receptionist_id", receptionistId)
    .order("valid_until", { ascending: false });
  if (error) return { error: error.message };
  return { data: (data ?? []) as PromoRow[] };
}

export async function createPromo(
  receptionistId: string,
  input: {
    description: string;
    code: string;
    eligibility?: unknown;
    valid_from?: string;
    valid_until?: string;
    discount_type?: string;
    discount_value?: number;
  }
): Promise<{ data: PromoRow } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const description = input.description?.trim();
  const code = input.code?.trim();
  if (!description) return { error: "Description is required." };
  if (!code) return { error: "Code is required." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("promos")
    .insert({
      receptionist_id: receptionistId,
      description,
      code,
      eligibility: input.eligibility ?? null,
      valid_from: input.valid_from || null,
      valid_until: input.valid_until || null,
      discount_type: input.discount_type?.trim() || null,
      discount_value: input.discount_value ?? null,
    })
    .select()
    .single();
  if (error) return { error: error.message };
  return { data: data as PromoRow };
}

export async function updatePromo(
  receptionistId: string,
  promoId: string,
  input: Partial<{
    description: string;
    code: string;
    eligibility: unknown;
    valid_from: string;
    valid_until: string;
    discount_type: string;
    discount_value: number;
  }>
): Promise<{ data: PromoRow } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const supabase = await createClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.description !== undefined) updates.description = input.description.trim();
  if (input.code !== undefined) updates.code = input.code.trim();
  if (input.eligibility !== undefined) updates.eligibility = input.eligibility;
  if (input.valid_from !== undefined) updates.valid_from = input.valid_from || null;
  if (input.valid_until !== undefined) updates.valid_until = input.valid_until || null;
  if (input.discount_type !== undefined) updates.discount_type = input.discount_type.trim() || null;
  if (input.discount_value !== undefined) updates.discount_value = input.discount_value;
  const { data, error } = await supabase
    .from("promos")
    .update(updates)
    .eq("id", promoId)
    .eq("receptionist_id", receptionistId)
    .select()
    .single();
  if (error) return { error: error.message };
  return { data: data as PromoRow };
}

export async function deletePromo(
  receptionistId: string,
  promoId: string
): Promise<{ ok: true } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("promos")
    .delete()
    .eq("id", promoId)
    .eq("receptionist_id", receptionistId);
  if (error) return { error: error.message };
  return { ok: true };
}
