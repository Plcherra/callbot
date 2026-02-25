import type { SupabaseClient } from "@supabase/supabase-js";

export type InsertCallUsageParams = {
  supabase: SupabaseClient;
  receptionistId: string;
  userId?: string | null;
  callSid: string;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  direction?: string | null;
  costCents?: number | null;
  status?: string;
};

export type InsertCallUsageResult = {
  error: { code: string; message: string } | null;
};

/**
 * Insert a call_usage row. Handles duplicate key (23505) gracefully.
 */
export async function insertCallUsage(
  params: InsertCallUsageParams
): Promise<InsertCallUsageResult> {
  const {
    supabase,
    receptionistId,
    userId,
    callSid,
    startedAt,
    endedAt,
    durationSeconds,
    direction,
    costCents,
    status = "completed",
  } = params;

  const insertRow: Record<string, unknown> = {
    receptionist_id: receptionistId,
    call_sid: callSid,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_seconds: durationSeconds,
    direction,
    cost_cents: costCents,
    status,
  };
  if (userId != null) {
    insertRow.user_id = userId;
  }

  const { error } = await supabase.from("call_usage").insert(insertRow);

  if (error) {
    if (error.code === "23505") {
      return { error: null };
    }
    return { error: { code: error.code, message: error.message } };
  }
  return { error: null };
}
