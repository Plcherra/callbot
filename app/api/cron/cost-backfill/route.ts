import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import twilio from "twilio";

/**
 * Cron endpoint to backfill cost_cents and direction for Twilio calls
 * where price was not available at webhook time (Twilio can delay up to 24h).
 * Run daily. Secure with CRON_SECRET.
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

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return NextResponse.json({ ok: true, updated: 0, error: "Twilio not configured" });
  }

  const supabase = createServiceRoleClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: rows } = await supabase
    .from("call_usage")
    .select("id, call_sid")
    .not("call_sid", "is", null)
    .is("cost_cents", null)
    .lt("created_at", cutoff)
    .limit(100);

  if (!rows?.length) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const client = twilio(accountSid, authToken);
  let updated = 0;

  for (const row of rows) {
    const callSid = row.call_sid as string;
    if (!callSid) continue;

    try {
      const call = await client.calls(callSid).fetch();
      const price = (call as { price?: string }).price;
      const direction = (call as { direction?: string }).direction;

      let costCents: number | null = null;
      if (price != null && price !== "") {
        const parsed = parseFloat(price);
        if (!Number.isNaN(parsed)) {
          costCents = Math.round(Math.abs(parsed) * 100);
        }
      }

      const dir =
        direction?.trim() && direction.toLowerCase().startsWith("inbound") ? "inbound" : "outbound";

      const updates: Record<string, unknown> = { direction: dir };
      if (costCents != null) {
        updates.cost_cents = costCents;
      }

      const { error } = await supabase
        .from("call_usage")
        .update(updates)
        .eq("id", row.id);

      if (!error) updated++;
    } catch (err) {
      console.warn("[cron/cost-backfill] Could not fetch call", callSid, err);
    }
  }

  return NextResponse.json({ ok: true, updated });
}
