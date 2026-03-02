import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/app/lib/supabase/server";

/**
 * Monthly reset: set used_inbound_minutes and used_outbound_minutes to 0.
 * Call on the 1st of each month (e.g. via Vercel Cron or external).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) {
    return NextResponse.json(
      { error: "Cron not configured (CRON_SECRET required)" },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("user_plans")
    .update({
      used_inbound_minutes: 0,
      used_outbound_minutes: 0,
      period_reset_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .not("user_id", "is", null);

  if (error) {
    console.error("[cron/reset-usage]", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
