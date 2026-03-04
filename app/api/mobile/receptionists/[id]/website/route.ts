/**
 * POST: Fetch website content and save to receptionist.
 * Body: { url: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/app/lib/supabase/getAuthUser";
import { fetchAndSaveWebsiteContent } from "@/app/actions/websiteContent";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, supabase } = await getAuthUser(req);
  if (!user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const url = body.url as string;

  if (!url?.trim()) {
    return NextResponse.json({ error: "Please enter a website URL." }, { status: 400 });
  }

  const result = await fetchAndSaveWebsiteContent(id.trim(), url.trim(), supabase);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
