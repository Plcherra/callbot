"use server";

import { createClient } from "@/app/lib/supabase/server";
import { assertReceptionistOwnership } from "@/app/actions/receptionistOwnership";

export type ReminderRuleRow = {
  id: string;
  receptionist_id: string;
  type: "reminder" | "rule";
  content: string;
  trigger: string | null;
  channel: string | null;
  created_at: string;
  updated_at: string;
};

export async function listReminderRules(
  receptionistId: string
): Promise<{ data: ReminderRuleRow[] } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reminder_rules")
    .select("*")
    .eq("receptionist_id", receptionistId)
    .order("type")
    .order("created_at");
  if (error) return { error: error.message };
  return { data: (data ?? []) as ReminderRuleRow[] };
}

export async function createReminderRule(
  receptionistId: string,
  input: { type: "reminder" | "rule"; content: string; trigger?: string; channel?: string }
): Promise<{ data: ReminderRuleRow } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const content = input.content?.trim();
  if (!content) return { error: "Content is required." };
  if (input.type !== "reminder" && input.type !== "rule") {
    return { error: "Type must be 'reminder' or 'rule'." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reminder_rules")
    .insert({
      receptionist_id: receptionistId,
      type: input.type,
      content,
      trigger: input.trigger?.trim() || null,
      channel: input.channel?.trim() || null,
    })
    .select()
    .single();
  if (error) return { error: error.message };
  return { data: data as ReminderRuleRow };
}

export async function updateReminderRule(
  receptionistId: string,
  ruleId: string,
  input: Partial<{ type: "reminder" | "rule"; content: string; trigger: string; channel: string }>
): Promise<{ data: ReminderRuleRow } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const supabase = await createClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.type !== undefined) updates.type = input.type;
  if (input.content !== undefined) updates.content = input.content.trim();
  if (input.trigger !== undefined) updates.trigger = input.trigger.trim() || null;
  if (input.channel !== undefined) updates.channel = input.channel.trim() || null;
  const { data, error } = await supabase
    .from("reminder_rules")
    .update(updates)
    .eq("id", ruleId)
    .eq("receptionist_id", receptionistId)
    .select()
    .single();
  if (error) return { error: error.message };
  return { data: data as ReminderRuleRow };
}

export async function deleteReminderRule(
  receptionistId: string,
  ruleId: string
): Promise<{ ok: true } | { error: string }> {
  const ownership = await assertReceptionistOwnership(receptionistId);
  if (!ownership.ok) return { error: ownership.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("reminder_rules")
    .delete()
    .eq("id", ruleId)
    .eq("receptionist_id", receptionistId);
  if (error) return { error: error.message };
  return { ok: true };
}
