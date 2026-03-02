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
  overageFlag?: boolean;
  billedMinutes?: number;
  paygMinutes?: number;
  telnyxCallControlId?: string;
  recordingConsentPlayed?: boolean;
};

export type InsertCallUsageResult = {
  error: { code: string; message: string } | null;
  /** True when a new row was inserted (false on duplicate 23505) */
  inserted?: boolean;
};

/**
 * Round duration to 6-second billing increments.
 */
export function roundToBilledMinutes(seconds: number): number {
  const increments = Math.ceil(seconds / 6);
  return (increments * 6) / 60;
}

/**
 * Insert a call_usage row. Handles duplicate key (23505) gracefully.
 * Billing rounds to 6-second increments.
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
    overageFlag,
    billedMinutes,
    paygMinutes,
    telnyxCallControlId,
    recordingConsentPlayed,
  } = params;

  const billed = billedMinutes ?? roundToBilledMinutes(durationSeconds);

  const insertRow: Record<string, unknown> = {
    receptionist_id: receptionistId,
    call_sid: callSid,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_seconds: durationSeconds,
    direction,
    cost_cents: costCents,
    status,
    billed_minutes: billed,
    overage_flag: overageFlag ?? false,
  };
  if (userId != null) insertRow.user_id = userId;
  if (paygMinutes != null) insertRow.payg_minutes = paygMinutes;
  if (telnyxCallControlId != null) insertRow.telnyx_call_control_id = telnyxCallControlId;
  if (recordingConsentPlayed !== undefined)
    insertRow.recording_consent_played = recordingConsentPlayed;

  const { error } = await supabase.from("call_usage").insert(insertRow);

  if (error) {
    if (error.code === "23505") {
      return { error: null, inserted: false };
    }
    return { error: { code: error.code, message: error.message }, inserted: false };
  }
  return { error: null, inserted: true };
}
