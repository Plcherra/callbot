/**
 * GET: Fetch receptionist. PATCH: Update receptionist (payment_settings, extra_instructions).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/app/lib/supabase/getAuthUser";
import {
  getReceptionist,
  updatePaymentSettings,
  updateExtraInstructions,
  type PaymentSettings,
} from "@/app/actions/receptionistSettings";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, supabase } = await getAuthUser(req);
  if (!user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await getReceptionist(id, supabase);

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error.includes("not found") ? 404 : 400 }
    );
  }
  return NextResponse.json(result.data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, supabase } = await getAuthUser(req);
  if (!user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  if (body.payment_settings !== undefined) {
    const result = await updatePaymentSettings(
      id,
      body.payment_settings as PaymentSettings,
      supabase
    );
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  }
  if (body.extra_instructions !== undefined) {
    const result = await updateExtraInstructions(
      id,
      body.extra_instructions as string | null,
      supabase
    );
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  }
  return NextResponse.json({ ok: true });
}
