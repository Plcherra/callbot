"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import type { ReminderRuleRow } from "./types";

type Props = {
  receptionistId: string;
  rules: ReminderRuleRow[];
  onAdd: (input: { type: "reminder" | "rule"; content: string; trigger?: string }) => void;
  onDelete: (id: string) => void;
};

export function ReminderRulesTab({ receptionistId, rules, onAdd, onDelete }: Props) {
  const [type, setType] = useState<"reminder" | "rule">("rule");
  const [content, setContent] = useState("");
  const [trigger, setTrigger] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onAdd({
      type,
      content: content.trim(),
      trigger: trigger.trim() || undefined,
    });
    setContent("");
    setTrigger("");
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reminders & rules</CardTitle>
        <CardDescription>Policy text and reminder config (e.g. 24h before).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "reminder" | "rule")}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="rule">Rule / policy</option>
            <option value="reminder">Reminder</option>
          </select>
          <Input
            placeholder="Trigger (e.g. 24h_before) for reminders"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            className="max-w-md"
          />
          <textarea
            placeholder="Content (e.g. Cancellations within 12h incur 50% fee)"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <Button type="submit" disabled={loading}>
            Add
          </Button>
        </form>
        <ul className="space-y-2">
          {rules.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between rounded border px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium">{r.type}:</span> {r.content}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => onDelete(r.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        {rules.length === 0 && (
          <p className="text-sm text-muted-foreground">No rules or reminders yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
