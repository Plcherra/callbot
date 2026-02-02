"use server";

import { createClient } from "@/app/lib/supabase/server";
import { assertReceptionistOwnership } from "@/app/actions/receptionistOwnership";

export type ServiceRow = {
  id: string;
  receptionist_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  duration_minutes: number;
  category: string | null;
  add_ons: unknown;
  created_at: string;
  updated_at: string;
};

export async function listServices(
  receptionistId: string
): Promise<{ data: ServiceRow[] } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("receptionist_id", receptionistId)
    .order("name");
  if (error) return { error: error.message };
  return { data: (data ?? []) as ServiceRow[] };
}

export async function createService(
  receptionistId: string,
  input: {
    name: string;
    description?: string;
    price_cents?: number;
    duration_minutes?: number;
    category?: string;
    add_ons?: unknown;
  }
): Promise<{ data: ServiceRow } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const name = input.name?.trim();
  if (!name) return { error: "Name is required." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .insert({
      receptionist_id: receptionistId,
      name,
      description: input.description?.trim() || null,
      price_cents: input.price_cents ?? 0,
      duration_minutes: input.duration_minutes ?? 0,
      category: input.category?.trim() || null,
      add_ons: input.add_ons ?? null,
    })
    .select()
    .single();
  if (error) return { error: error.message };
  return { data: data as ServiceRow };
}

export async function updateService(
  receptionistId: string,
  serviceId: string,
  input: Partial<{
    name: string;
    description: string;
    price_cents: number;
    duration_minutes: number;
    category: string;
    add_ons: unknown;
  }>
): Promise<{ data: ServiceRow } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const supabase = await createClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.description !== undefined) updates.description = input.description.trim() || null;
  if (input.price_cents !== undefined) updates.price_cents = input.price_cents;
  if (input.duration_minutes !== undefined) updates.duration_minutes = input.duration_minutes;
  if (input.category !== undefined) updates.category = input.category.trim() || null;
  if (input.add_ons !== undefined) updates.add_ons = input.add_ons;
  const { data, error } = await supabase
    .from("services")
    .update(updates)
    .eq("id", serviceId)
    .eq("receptionist_id", receptionistId)
    .select()
    .single();
  if (error) return { error: error.message };
  return { data: data as ServiceRow };
}

export async function deleteService(
  receptionistId: string,
  serviceId: string
): Promise<{ ok: true } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", serviceId)
    .eq("receptionist_id", receptionistId);
  if (error) return { error: error.message };
  return { ok: true };
}
