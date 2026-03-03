/**
 * Sync subscription from Stripe Checkout session_id (after mobile returns from Checkout).
 * Body: { session_id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/app/lib/supabase/getAuthUser";
import { syncSubscriptionFromSession } from "@/app/actions/syncSubscription";

export async function POST(req: NextRequest) {
  const { user } = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const sessionId = body.session_id as string | undefined;

  if (!sessionId?.trim()) {
    return NextResponse.json(
      { error: "session_id required" },
      { status: 400 }
    );
  }

  const { synced, error } = await syncSubscriptionFromSession(
    sessionId.trim(),
    user.id
  );

  if (error) {
    return NextResponse.json({ error, synced: false }, { status: 400 });
  }
  return NextResponse.json({ synced });
}
