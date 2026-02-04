import { NextRequest, NextResponse } from "next/server";
import { invoicePerMinuteUsersForPreviousMonth } from "@/app/lib/billing";

/**
 * Cron endpoint to invoice per-minute users for the previous month.
 * Run once at the start of each month. Secure with CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await invoicePerMinuteUsersForPreviousMonth();
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/billing] invoice job failed", { error: message });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
