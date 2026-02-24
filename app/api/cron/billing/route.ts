import { NextRequest, NextResponse } from "next/server";
import {
  invoicePerMinuteUsersForPreviousMonth,
  invoiceSubscriptionOverageForPreviousMonth,
} from "@/app/lib/billing";

/**
 * Cron endpoint to invoice per-minute users and subscription overage for the previous month.
 * Run once at the start of each month. Secure with CRON_SECRET.
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

  try {
    const perMinute = await invoicePerMinuteUsersForPreviousMonth();
    const overage = await invoiceSubscriptionOverageForPreviousMonth();
    return NextResponse.json({
      ok: true,
      per_minute: perMinute,
      overage,
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
