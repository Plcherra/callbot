"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { createReceptionist } from "@/app/actions/createReceptionist";

type Props = { defaultCalendarId: string };

export function AddReceptionistForm({ defaultCalendarId }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [calendarId, setCalendarId] = useState(defaultCalendarId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);
    const result = await createReceptionist({ name, phone_number: phone, calendar_id: calendarId });
    setLoading(false);
    if (result.success) {
      setSuccess(true);
      setName("");
      setPhone("");
      setCalendarId(defaultCalendarId);
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>+ Add Receptionist</CardTitle>
        <CardDescription>
          Create a new AI assistant. Name, phone, and calendar ID are required.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="rec-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="rec-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main line"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="rec-phone" className="text-sm font-medium">
              Phone number
            </label>
            <Input
              id="rec-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+15551234567"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="rec-calendar" className="text-sm font-medium">
              Calendar ID
            </label>
            <Input
              id="rec-calendar"
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              placeholder="primary or email@example.com"
              required
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert variant="success">
              <AlertDescription>Receptionist created. Refresh to see it in the list.</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create receptionist"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
