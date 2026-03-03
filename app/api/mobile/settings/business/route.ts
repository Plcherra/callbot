/**
 * Update business name and address. Body: { business_name?, business_address? }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/app/lib/supabase/getAuthUser";
import { updateBusiness } from "@/app/actions/settings";

export async function PATCH(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const result = await updateBusiness(
    {
      business_name: body.business_name ?? "",
      business_address: body.business_address ?? "",
    },
    supabase
  );

  if (result.success) {
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: result.error }, { status: 400 });
}
