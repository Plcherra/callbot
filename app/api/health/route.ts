import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/app/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Health check for uptime monitors and load balancers.
 * Returns 200 with status; optionally checks Supabase connectivity.
 */
export async function GET() {
  let supabaseStatus: "ok" | "error" = "ok";
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("users").select("id").limit(1).maybeSingle();
    if (error) {
      supabaseStatus = "error";
      console.error("[health] Supabase check failed", { error: error.message });
    }
  } catch (err) {
    supabaseStatus = "error";
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[health] Supabase check failed", { error: message });
  }

  const status = supabaseStatus === "ok" ? "ok" : "degraded";
  return NextResponse.json(
    { status, supabase: supabaseStatus },
    { status: status === "ok" ? 200 : 503 }
  );
}
