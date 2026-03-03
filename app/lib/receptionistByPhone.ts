import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeToE164 } from "./phone";

export type ReceptionistByPhone = {
  id: string;
  name?: string;
  user_id?: string;
};

function getLookupVariants(phone: string): string[] {
  const trimmed = phone?.trim() || "";
  if (!trimmed) return [];
  const e164 = normalizeToE164(trimmed);
  const digits = trimmed.replace(/\D/g, "");
  const us10 = digits.length === 10 ? digits : digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : null;
  const variants: string[] = [trimmed];
  if (e164) variants.push(e164);
  if (us10) {
    variants.push(`+1${us10}`, `1${us10}`);
  }
  return [...new Set(variants)];
}

/**
 * Look up an active receptionist by the "To" phone number (called number).
 * Normalizes formats (E.164, with/without +) and tries telnyx_phone_number first, then inbound_phone_number.
 */
export async function getReceptionistByPhoneNumber(
  supabase: SupabaseClient,
  to: string
): Promise<ReceptionistByPhone | null> {
  const variants = getLookupVariants(to);

  for (const v of unique) {
    const { data: byTelnyx } = await supabase
      .from("receptionists")
      .select("id, name, user_id")
      .eq("telnyx_phone_number", v)
      .eq("status", "active")
      .maybeSingle();
    if (byTelnyx) return byTelnyx;

    const { data: byInbound } = await supabase
      .from("receptionists")
      .select("id, name, user_id")
      .eq("inbound_phone_number", v)
      .eq("status", "active")
      .maybeSingle();
    if (byInbound) return byInbound;
  }

  const { data: all } = await supabase
    .from("receptionists")
    .select("id, name, user_id, telnyx_phone_number, inbound_phone_number")
    .eq("status", "active");
  const toDigits = (variants[0] ?? to).replace(/\D/g, "");
  const toUs10 = toDigits.length === 11 && toDigits.startsWith("1") ? toDigits.slice(1) : toDigits.length === 10 ? toDigits : null;
  for (const r of all ?? []) {
    const tn = (r as { telnyx_phone_number?: string }).telnyx_phone_number ?? "";
    const ib = (r as { inbound_phone_number?: string }).inbound_phone_number ?? "";
    const tnDig = tn.replace(/\D/g, "");
    const ibDig = ib.replace(/\D/g, "");
    const tnUs10 = tnDig.length === 11 && tnDig.startsWith("1") ? tnDig.slice(1) : tnDig.length === 10 ? tnDig : "";
    const ibUs10 = ibDig.length === 11 && ibDig.startsWith("1") ? ibDig.slice(1) : ibDig.length === 10 ? ibDig : "";
    const match = (tnDig && (tnDig === toDigits || (toUs10 && tnUs10 === toUs10))) ||
      (ibDig && (ibDig === toDigits || (toUs10 && ibUs10 === toUs10)));
    if (match) return { id: r.id, name: r.name, user_id: r.user_id };
  }
  return null;
}
