"use server";

import { createClient } from "@/app/lib/supabase/server";
import { assertReceptionistOwnership } from "@/app/actions/receptionistOwnership";

export type LocationRow = {
  id: string;
  receptionist_id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  hours: unknown;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function listLocations(
  receptionistId: string
): Promise<{ data: LocationRow[] } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .eq("receptionist_id", receptionistId)
    .order("name");
  if (error) return { error: error.message };
  return { data: (data ?? []) as LocationRow[] };
}

export async function createLocation(
  receptionistId: string,
  input: {
    name: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    hours?: unknown;
    notes?: string;
  }
): Promise<{ data: LocationRow } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const name = input.name?.trim();
  if (!name) return { error: "Name is required." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locations")
    .insert({
      receptionist_id: receptionistId,
      name,
      address: input.address?.trim() || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      hours: input.hours ?? null,
      notes: input.notes?.trim() || null,
    })
    .select()
    .single();
  if (error) return { error: error.message };
  return { data: data as LocationRow };
}

export async function updateLocation(
  receptionistId: string,
  locationId: string,
  input: Partial<{
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    hours: unknown;
    notes: string;
  }>
): Promise<{ data: LocationRow } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const supabase = await createClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.address !== undefined) updates.address = input.address.trim() || null;
  if (input.latitude !== undefined) updates.latitude = input.latitude;
  if (input.longitude !== undefined) updates.longitude = input.longitude;
  if (input.hours !== undefined) updates.hours = input.hours;
  if (input.notes !== undefined) updates.notes = input.notes.trim() || null;
  const { data, error } = await supabase
    .from("locations")
    .update(updates)
    .eq("id", locationId)
    .eq("receptionist_id", receptionistId)
    .select()
    .single();
  if (error) return { error: error.message };
  return { data: data as LocationRow };
}

export async function deleteLocation(
  receptionistId: string,
  locationId: string
): Promise<{ ok: true } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("locations")
    .delete()
    .eq("id", locationId)
    .eq("receptionist_id", receptionistId);
  if (error) return { error: error.message };
  return { ok: true };
}
