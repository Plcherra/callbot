/**
 * Update inbound/outbound minute split. Body: { inbound_percent: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/app/lib/supabase/getAuthUser";
import { updatePlanSplit } from "@/app/actions/updatePlanSplit";

export async function POST(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const inboundPercent = typeof body.inbound_percent === "number"
    ? body.inbound_percent
    : parseInt(String(body.inbound_percent), 10);

  if (Number.isNaN(inboundPercent) || inboundPercent < 0 || inboundPercent > 100) {
    return NextResponse.json(
      { error: "inbound_percent must be 0-100" },
      { status: 400 }
    );
  }

  const result = await updatePlanSplit(inboundPercent, supabase);
  if (result.success) {
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: result.error }, { status: 400 });
}
