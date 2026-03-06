/**
 * Fetches and builds the system prompt for a receptionist.
 * Used by webhook (pre-cache) and receptionist-prompt API route.
 */

import { createServiceRoleClient } from "@/app/lib/supabase/server";
import { buildReceptionistPrompt } from "@/app/lib/buildReceptionistPrompt";

const DEFAULT = {
  prompt: "You are an AI receptionist. Be helpful and concise.",
  greeting: "Hello! Thanks for calling. How can I help you today?",
};

export async function getReceptionistPrompt(
  receptionistId: string
): Promise<{ prompt: string; greeting: string }> {
  if (!receptionistId?.trim()) return DEFAULT;

  const supabase = createServiceRoleClient();

  const { data: rec, error: recError } = await supabase
    .from("receptionists")
    .select("id, name, phone_number, calendar_id, payment_settings, website_content, extra_instructions")
    .eq("id", receptionistId)
    .single();

  if (recError || !rec) return DEFAULT;

  const [
    { data: staff },
    { data: services },
    { data: locations },
    { data: promos },
    { data: reminderRules },
  ] = await Promise.all([
    supabase.from("staff").select("name, role, specialties").eq("receptionist_id", receptionistId).order("name"),
    supabase.from("services").select("name, description, price_cents, duration_minutes, category").eq("receptionist_id", receptionistId),
    supabase.from("locations").select("name, address, notes").eq("receptionist_id", receptionistId),
    supabase.from("promos").select("description, code, discount_type, discount_value").eq("receptionist_id", receptionistId),
    supabase.from("reminder_rules").select("type, content").eq("receptionist_id", receptionistId),
  ]);

  const greeting = `Hello! Thanks for calling. I'm ${rec.name}. How can I help you today?`;

  const prompt = buildReceptionistPrompt({
    name: rec.name,
    phoneNumber: rec.phone_number,
    calendarId: rec.calendar_id ?? "",
    staff: (staff ?? []).map((s) => ({
      name: s.name,
      role: s.role,
      specialties: s.specialties,
    })),
    services: (services ?? []).map((s) => ({
      name: s.name,
      description: s.description,
      price_cents: s.price_cents ?? 0,
      duration_minutes: s.duration_minutes ?? 0,
      category: s.category,
    })),
    locations: (locations ?? []).map((l) => ({
      name: l.name,
      address: l.address,
      notes: l.notes,
    })),
    promos: (promos ?? []).map((p) => ({
      description: p.description,
      code: p.code,
      discount_type: p.discount_type,
      discount_value: p.discount_value,
    })),
    reminderRules: (reminderRules ?? []).map((r) => ({
      type: r.type,
      content: r.content,
    })),
    paymentSettings: rec.payment_settings ?? undefined,
    websiteContent: rec.website_content ?? undefined,
    extraInstructions: rec.extra_instructions ?? undefined,
    compact: true,
  });

  return { prompt, greeting };
}
