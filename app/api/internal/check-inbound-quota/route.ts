/**
 * Internal API: Check inbound quota for a user.
 * Called by the voice backend before answering inbound calls.
 * Protected by x-internal-api-key header.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import { checkInboundQuota } from "@/app/lib/quotaCheck";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-internal-api-key")?.trim();
  const expected = process.env.INTERNAL_API_KEY?.trim();
  if (!expected || apiKey !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const userId = body.user_id as string | undefined;

  if (!userId?.trim()) {
    return NextResponse.json(
      { error: "user_id required" },
      { status: 400 }
    );
  }

  const supabase = createServiceRoleClient();
  const result = await checkInboundQuota(supabase, userId);
  return NextResponse.json(result);
}
