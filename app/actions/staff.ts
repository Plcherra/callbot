"use server";

import { createClient } from "@/app/lib/supabase/server";
import { assertReceptionistOwnership } from "@/app/actions/receptionistOwnership";

export type StaffRow = {
  id: string;
  receptionist_id: string;
  name: string;
  role: string | null;
  specialties: unknown;
  photo_url: string | null;
  calendar_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function listStaff(
  receptionistId: string
): Promise<{ data: StaffRow[] } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff")
    .select("*")
    .eq("receptionist_id", receptionistId)
    .order("name");
  if (error) return { error: error.message };
  return { data: (data ?? []) as StaffRow[] };
}

export async function createStaff(
  receptionistId: string,
  input: { name: string; role?: string; specialties?: unknown; photo_url?: string; calendar_id?: string; is_active?: boolean }
): Promise<{ data: StaffRow } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const name = input.name?.trim();
  if (!name) return { error: "Name is required." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff")
    .insert({
      receptionist_id: receptionistId,
      name,
      role: input.role?.trim() ?? null,
      specialties: input.specialties ?? null,
      photo_url: input.photo_url?.trim() || null,
      calendar_id: input.calendar_id?.trim() || null,
      is_active: input.is_active ?? true,
    })
    .select()
    .single();
  if (error) return { error: error.message };
  return { data: data as StaffRow };
}

export async function updateStaff(
  receptionistId: string,
  staffId: string,
  input: Partial<{ name: string; role: string; specialties: unknown; photo_url: string; calendar_id: string; is_active: boolean }>
): Promise<{ data: StaffRow } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const supabase = await createClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.role !== undefined) updates.role = input.role.trim() || null;
  if (input.specialties !== undefined) updates.specialties = input.specialties;
  if (input.photo_url !== undefined) updates.photo_url = input.photo_url.trim() || null;
  if (input.calendar_id !== undefined) updates.calendar_id = input.calendar_id.trim() || null;
  if (input.is_active !== undefined) updates.is_active = input.is_active;
  const { data, error } = await supabase
    .from("staff")
    .update(updates)
    .eq("id", staffId)
    .eq("receptionist_id", receptionistId)
    .select()
    .single();
  if (error) return { error: error.message };
  return { data: data as StaffRow };
}

export async function deleteStaff(
  receptionistId: string,
  staffId: string
): Promise<{ ok: true } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("staff")
    .delete()
    .eq("id", staffId)
    .eq("receptionist_id", receptionistId);
  if (error) return { error: error.message };
  return { ok: true };
}
