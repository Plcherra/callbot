import { NextRequest, NextResponse } from "next/server";

/**
 * Legacy cron endpoint. Overage billing is now handled by /api/cron/payg-billing
 * (which runs both PAYG invoicing and overage for fixed plans via usageBilling).
 * This endpoint is deprecated—configure your cron to use payg-billing instead.
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

  return NextResponse.json({
    ok: true,
    deprecated: true,
    message:
      "Overage billing moved to /api/cron/payg-billing. Update your cron to call that endpoint instead.",
  });
}
