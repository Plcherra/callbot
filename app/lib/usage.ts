import { createServiceRoleClient } from "@/app/lib/supabase/server";

function getCurrentMonthPeriod(): { period_start: string; period_end: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  return {
    period_start: first.toISOString().slice(0, 10),
    period_end: last.toISOString().slice(0, 10),
  };
}

export type UsageSnapshotRow = {
  receptionist_id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  total_seconds: number;
  billing_plan: string | null;
  included_minutes: number | null;
  overage_minutes: number;
};

/**
 * For one receptionist and given period, sum call_usage and upsert usage_snapshots.
 * Uses service role. Call from cron or after webhook.
 */
export async function aggregateUsageForReceptionist(
  receptionistId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ total_seconds: number; overage_minutes: number } | null> {
  const supabase = createServiceRoleClient();

  const { data: receptionist } = await supabase
    .from("receptionists")
    .select("id, user_id")
    .eq("id", receptionistId)
    .single();

  if (!receptionist) return null;

  // Attribute each call to the period where it ended (avoids undercount at month boundaries)
  const { data: usageRows } = await supabase
    .from("call_usage")
    .select("duration_seconds, direction, payg_minutes, billed_minutes")
    .eq("receptionist_id", receptionistId)
    .gte("ended_at", `${periodStart}T00:00:00.000Z`)
    .lte("ended_at", `${periodEnd}T23:59:59.999Z`);

  const { data: userRow } = await supabase
    .from("users")
    .select("billing_plan, billing_plan_metadata")
    .eq("id", receptionist.user_id)
    .single();

  let total_seconds = 0;
  let inbound_seconds = 0;
  let outbound_seconds = 0;
  let payg_minutes: number | null = null;

  for (const r of usageRows ?? []) {
    const sec = r.duration_seconds ?? 0;
    total_seconds += sec;
    const dir = (r.direction ?? "").toLowerCase();
    if (dir === "inbound") inbound_seconds += sec;
    else if (dir === "outbound") outbound_seconds += sec;
  }

  if (userRow?.billing_plan === "subscription_payg") {
    payg_minutes =
      usageRows?.reduce(
        (s, r) => s + Number(r.payg_minutes ?? r.billed_minutes ?? (r.duration_seconds ?? 0) / 60),
        0
      ) ?? 0;
  }

  const metadata = userRow?.billing_plan_metadata as
    | { included_minutes?: number }
    | null
    | undefined;
  const included_minutes =
    typeof metadata?.included_minutes === "number" ? metadata.included_minutes : null;
  const total_minutes = Math.ceil(total_seconds / 60);
  const overage_minutes =
    included_minutes != null && userRow?.billing_plan !== "subscription_payg"
      ? Math.max(0, total_minutes - included_minutes)
      : 0;

  const { error } = await supabase.from("usage_snapshots").upsert(
    {
      user_id: receptionist.user_id,
      receptionist_id: receptionistId,
      period_start: periodStart,
      period_end: periodEnd,
      total_seconds,
      inbound_seconds,
      outbound_seconds,
      payg_minutes,
      billing_plan: userRow?.billing_plan ?? null,
      included_minutes,
      overage_minutes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "receptionist_id,period_start" }
  );

  if (error) {
    console.error("[usage] usage_snapshots upsert failed", {
      receptionistId,
      periodStart,
      error: error.message,
    });
    return null;
  }

  return { total_seconds, overage_minutes };
}

/** Current UTC month period (for display and queries). */
export function getCurrentPeriod(): { period_start: string; period_end: string } {
  return getCurrentMonthPeriod();
}

/**
 * Aggregate usage for the current month for all receptionists that have call_usage in that period.
 * Can be run daily via cron. Uses service role.
 */
export async function aggregateUsageForCurrentMonth(): Promise<{
  updated: number;
  errors: number;
}> {
  const supabase = createServiceRoleClient();
  const { period_start, period_end } = getCurrentMonthPeriod();

  const { data: receptionists } = await supabase
    .from("receptionists")
    .select("id");

  if (!receptionists?.length) {
    return { updated: 0, errors: 0 };
  }

  let updated = 0;
  let errors = 0;

  for (const r of receptionists) {
    const result = await aggregateUsageForReceptionist(
      r.id,
      period_start,
      period_end
    );
    if (result != null) updated++;
    else errors++;
  }

  return { updated, errors };
}
