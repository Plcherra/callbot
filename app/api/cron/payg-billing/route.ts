import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/app/lib/supabase/server";
import { getStripe } from "@/app/lib/stripe";
import {
  invoicePaygForPreviousMonth,
  invoiceOverageForFixedPlans,
} from "@/app/lib/usageBilling";

/**
 * End-of-month billing: PAYG invoicing + overage for fixed plans.
 * Call daily (e.g. 1st of month); idempotent.
 * Run before reset-usage cron so user_plans.used_* are still populated.
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
    const supabase = createServiceRoleClient();
    const stripe = getStripe();
    const paygResult = await invoicePaygForPreviousMonth(supabase, stripe);
    const overageResult = await invoiceOverageForFixedPlans(supabase, stripe);
    return NextResponse.json({
      ok: true,
      payg: paygResult,
      overage: overageResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron/payg-billing]", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
