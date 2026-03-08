/**
 * Register FCM push token for call notifications.
 * Body: { token: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/app/lib/supabase/getAuthUser";
import { createServiceRoleClient } from "@/app/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { user } = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const token = body.token as string | undefined;

  if (!token?.trim()) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();
    await supabase.from("user_push_tokens").upsert(
      {
        user_id: user.id,
        token: token.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[push-token]", err);
    return NextResponse.json(
      { error: "Failed to register token" },
      { status: 500 }
    );
  }
}
