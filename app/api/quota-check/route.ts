/**
 * Check outbound quota before initiating an outbound call.
 * Returns { allowed, remainingMinutes? } or { allowed: false, reason }.
 * Supports cookie (web) and Bearer token (mobile) auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/app/lib/supabase/getAuthUser";
import { checkOutboundQuota } from "@/app/lib/quotaCheck";

export async function GET(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);

  if (!user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await checkOutboundQuota(supabase, user.id);
  return NextResponse.json(result);
}
