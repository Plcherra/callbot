import { NextRequest, NextResponse } from "next/server";
import { aggregateUsageForCurrentMonth } from "@/app/lib/usage";

/**
 * Cron endpoint to aggregate call_usage into usage_snapshots for the current month.
 * Call daily (e.g. Vercel Cron or external). Secure with CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { updated, errors } = await aggregateUsageForCurrentMonth();
    return NextResponse.json({
      ok: true,
      updated,
      errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/usage] aggregation failed", { error: message });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
