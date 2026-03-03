/**
 * Initiate an outbound call. Quota check → Telnyx create_call → return call ID.
 * Same voice pipeline as inbound (stream to /api/voice/stream).
 * Supports cookie (web) and Bearer token (mobile) auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/app/lib/supabase/getAuthUser";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import { checkOutboundQuota } from "@/app/lib/quotaCheck";
import { createOutboundCall } from "@/app/lib/telnyx";
import { isPlaceholderUrl } from "@/app/lib/urlUtils";

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}

export async function POST(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const receptionistId = body.receptionist_id as string | undefined;
  const toPhone = body.to as string | undefined;

  if (!receptionistId?.trim() || !toPhone?.trim()) {
    return NextResponse.json(
      { error: "receptionist_id and to (E.164) required" },
      { status: 400 }
    );
  }

  const quota = await checkOutboundQuota(supabase, user.id);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: quota.reason ?? "Quota exceeded" },
      { status: 403 }
    );
  }

  const svc = createServiceRoleClient();
  const { data: rec } = await svc
    .from("receptionists")
    .select("id, telnyx_phone_number, user_id")
    .eq("id", receptionistId)
    .eq("user_id", user.id)
    .single();

  if (!rec?.telnyx_phone_number) {
    return NextResponse.json(
      { error: "Receptionist not found or has no Telnyx number" },
      { status: 404 }
    );
  }

  const base =
    process.env.TELNYX_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!base?.trim() || isPlaceholderUrl(base)) {
    return NextResponse.json(
      { error: "TELNYX_WEBHOOK_BASE_URL not configured" },
      { status: 503 }
    );
  }

  try {
    const { call_control_id } = await createOutboundCall({
      from: rec.telnyx_phone_number,
      to: toE164(toPhone),
      webhookUrl: `${base.replace(/\/$/, "")}/api/telnyx/voice`,
    });
    return NextResponse.json({ call_control_id, ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[telnyx/outbound]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
