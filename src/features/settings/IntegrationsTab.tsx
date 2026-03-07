"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { CalendarConnect } from "@/app/components/dashboard/CalendarConnect";
import { PhoneInput } from "@/app/components/dashboard/PhoneInput";

type Props = { calendarId: string | null; phone: string | null; userId: string };

export function IntegrationsTab({ calendarId, phone, userId }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>These settings are used as defaults when creating new receptionists.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <CalendarConnect calendarId={calendarId} userId={userId} />
        <div className="rounded-lg border p-4">
          <PhoneInput initialPhone={phone} />
        </div>
        <p className="text-xs text-muted-foreground">Calls are recorded. Ensure compliance with local recording laws.</p>
      </CardContent>
    </Card>
  );
}
