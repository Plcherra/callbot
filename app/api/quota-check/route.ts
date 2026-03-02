/**
 * Check outbound quota before initiating an outbound call.
 * Returns { allowed, remainingMinutes? } or { allowed: false, reason }.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";
import { checkOutboundQuota } from "@/app/lib/quotaCheck";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await checkOutboundQuota(supabase, user.id);
  return NextResponse.json(result);
}
