"use client";

import { useState } from "react";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { savePhone } from "@/app/actions/dashboard";

type Props = { initialPhone: string | null };

export function PhoneInput({ initialPhone }: Props) {
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const result = await savePhone(phone);
    setSaving(false);
    if (result.success) setSaved(true);
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Your business phone number</label>
      <div className="flex gap-2">
        <Input
          type="tel"
          placeholder="+15551234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={handleSave}
        />
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Use E.164 format (e.g. +15551234567)
      </p>
    </div>
  );
}
