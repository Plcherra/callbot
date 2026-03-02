"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";

type Props = {
  receptionistId: string;
  /** Must be present to show section (receptionist has Telnyx number). */
  hasTelnyxNumber: boolean;
};

export function OutboundCallSection({
  receptionistId,
  hasTelnyxNumber,
}: Props) {
  const [toPhone, setToPhone] = useState("");
  const [calling, setCalling] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleCall(e: React.FormEvent) {
    e.preventDefault();
    const phone = toPhone.trim();
    if (!phone) {
      setMessage({ type: "error", text: "Enter a phone number." });
      return;
    }
    setCalling(true);
    setMessage(null);
    try {
      const res = await fetch("/api/telnyx/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ receptionist_id: receptionistId, to: phone }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setMessage({ type: "success", text: "Call initiated. The other party should answer shortly." });
        setToPhone("");
      } else {
        setMessage({ type: "error", text: data.error ?? "Failed to place call." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setCalling(false);
    }
  }

  if (!hasTelnyxNumber) return null;

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="text-base">Place outbound call</CardTitle>
        <p className="text-sm text-muted-foreground">
          Use your AI receptionist to call a customer. Enter the number in E.164 format.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCall} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] space-y-2">
            <label htmlFor="outbound-to" className="sr-only">
              Phone number to call
            </label>
            <Input
              id="outbound-to"
              type="tel"
              placeholder="+15551234567"
              value={toPhone}
              onChange={(e) => setToPhone(e.target.value)}
              disabled={calling}
            />
          </div>
          <Button type="submit" disabled={calling}>
            {calling ? "Calling…" : "Call"}
          </Button>
        </form>
        {message && (
          <Alert
            variant={message.type === "error" ? "destructive" : "default"}
            className="mt-3"
          >
            <AlertTitle>{message.type === "error" ? "Error" : "Success"}</AlertTitle>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
