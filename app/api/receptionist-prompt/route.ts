import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import { buildReceptionistPrompt } from "@/app/lib/buildReceptionistPrompt";

/**
 * Returns the built system prompt for a receptionist.
 * Used by the voice server to get the prompt for Twilio Media Streams calls.
 * Optionally secured with x-voice-server-key header.
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.VOICE_SERVER_API_KEY;
  if (apiKey) {
    const provided = req.headers.get("x-voice-server-key");
    if (provided !== apiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const receptionistId = req.nextUrl.searchParams.get("receptionist_id");
  if (!receptionistId) {
    return NextResponse.json({ error: "receptionist_id required" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: rec, error: recError } = await supabase
    .from("receptionists")
    .select("id, name, phone_number, calendar_id, payment_settings, website_content, extra_instructions")
    .eq("id", receptionistId)
    .single();

  if (recError || !rec) {
    return NextResponse.json({ error: "Receptionist not found" }, { status: 404 });
  }

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

  return NextResponse.json({ prompt, charCount: prompt.length });
}
