"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { updatePlanSplit } from "@/app/actions/updatePlanSplit";

type Props = { inboundPercent: number };

export function PlanSplitForm({ inboundPercent }: Props) {
  const router = useRouter();
  const [pct, setPct] = useState(inboundPercent);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  useEffect(() => { setPct(inboundPercent); }, [inboundPercent]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setMessage(null);
    const result = await updatePlanSplit(pct);
    setSaving(false);
    if (result.success) { setMessage({ type: "success", text: "Minutes split saved." }); router.refresh(); }
    else setMessage({ type: "error", text: result.error ?? "Failed to save." });
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Minutes split</h3>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <label htmlFor="inbound-percent" className="text-sm font-medium">Inbound %</label>
          <Input id="inbound-percent" type="number" min={0} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value) || 0)} />
        </div>
        <div className="text-sm text-muted-foreground">Outbound: {100 - pct}%</div>
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save split"}</Button>
      </form>
      {message && <Alert variant={message.type === "error" ? "destructive" : "default"} className="mt-2"><AlertDescription>{message.text}</AlertDescription></Alert>}
    </div>
  );
}
