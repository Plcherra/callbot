"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { updateExtraInstructions } from "@/app/actions/receptionistSettings";
import type { SettingsMessage } from "./types";

type Props = {
  receptionistId: string;
  extraInstructions: string;
  setExtraInstructions: (v: string) => void;
  onMessage: (m: SettingsMessage) => void;
  onRefresh: () => void;
};

export function ExtraInstructionsCard({
  receptionistId,
  extraInstructions,
  setExtraInstructions,
  onMessage,
  onRefresh,
}: Props) {
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    onMessage(null);
    const res = await updateExtraInstructions(receptionistId, extraInstructions || null);
    setSaving(false);
    if ("error" in res) {
      onMessage({ type: "error", text: res.error });
      return;
    }
    onMessage({ type: "success", text: "Saved." });
    onRefresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Extra instructions (optional)</CardTitle>
        <CardDescription>
          Anything else the assistant should know? e.g. opening hours, cancellation policy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <textarea
          value={extraInstructions}
          onChange={(e) => setExtraInstructions(e.target.value)}
          placeholder="e.g. We're closed on Sundays. Cancellations must be 24h in advance."
          rows={4}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
