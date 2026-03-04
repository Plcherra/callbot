/**
 * GET: Fetch prompt preview for receptionist.
 * Query: compact?: boolean
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/app/lib/supabase/getAuthUser";
import { getPromptPreview } from "@/app/actions/applyReceptionistPrompt";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, supabase } = await getAuthUser(req);
  if (!user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const compact = req.nextUrl.searchParams.get("compact") === "true";

  const result = await getPromptPreview(id.trim(), { compact }, supabase);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
