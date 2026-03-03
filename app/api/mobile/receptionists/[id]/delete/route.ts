/**
 * Delete receptionist. Releases Telnyx number if present.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/app/lib/supabase/getAuthUser";
import { deleteReceptionist } from "@/app/actions/deleteReceptionist";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, supabase } = await getAuthUser(req);
  if (!user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await deleteReceptionist(id, supabase);

  if (result.success) {
    return NextResponse.json({ success: true });
  }
  return NextResponse.json(
    { error: result.error },
    { status: result.error?.includes("not found") ? 404 : 400 }
  );
}
