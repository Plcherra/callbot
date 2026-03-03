/**
 * Create receptionist. Body: CreateReceptionistWizardData
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/app/lib/supabase/getAuthUser";
import { createReceptionist } from "@/app/actions/createReceptionist";
import type { CreateReceptionistWizardData } from "@/app/actions/createReceptionist";

export async function POST(req: NextRequest) {
  const { user, supabase } = await getAuthUser(req);
  if (!user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as CreateReceptionistWizardData;
  body.country = body.country || "US";
  body.phone_strategy = body.phone_strategy || "new";
  body.system_prompt = body.system_prompt || "";
  body.staff = body.staff || [];

  const result = await createReceptionist(body, supabase);

  if (result.success) {
    return NextResponse.json({
      success: true,
      id: result.id,
      phoneNumber: result.phoneNumber,
    });
  }
  return NextResponse.json(
    { error: result.error },
    { status: 400 }
  );
}
