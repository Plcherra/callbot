"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { updateBusiness } from "@/app/actions/settings";

type Props = { businessName: string; businessAddress: string };

export function BusinessTab({ businessName, businessAddress }: Props) {
  const router = useRouter();
  const [nameVal, setNameVal] = useState(businessName);
  const [addressVal, setAddressVal] = useState(businessAddress);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMessage(null);
    const result = await updateBusiness({ business_name: nameVal, business_address: addressVal });
    setSaving(false);
    if (result.success) { setMessage({ type: "success", text: "Saved." }); router.refresh(); }
    else setMessage({ type: "error", text: result.error ?? "Failed to save." });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your details</CardTitle>
        <CardDescription>Name and address (optional)</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="business-name" className="text-sm font-medium">Name or business name</label>
            <Input id="business-name" value={nameVal} onChange={(e) => setNameVal(e.target.value)} placeholder="My Salon" />
          </div>
          <div className="space-y-2">
            <label htmlFor="business-address" className="text-sm font-medium">Address (optional)</label>
            <Input id="business-address" value={addressVal} onChange={(e) => setAddressVal(e.target.value)} placeholder="123 Main St, City" />
          </div>
          {message && <Alert variant={message.type === "error" ? "destructive" : "default"}><AlertDescription>{message.text}</AlertDescription></Alert>}
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
