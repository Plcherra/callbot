/**
 * Get Google OAuth URL for calendar connection. Mobile opens this in browser.
 * Query: return_to (e.g. "settings", "onboarding", "dashboard")
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/app/lib/supabase/getAuthUser";
import { getGoogleAuthUrl } from "@/app/actions/google";

export async function GET(req: NextRequest) {
  const { user } = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const returnTo = req.nextUrl.searchParams.get("return_to") || "dashboard";

  try {
    const url = await getGoogleAuthUrl(user.id, returnTo);
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get auth URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
