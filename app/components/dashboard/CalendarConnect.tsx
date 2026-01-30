"use client";

import { Button } from "@/app/components/ui/button";
import { getGoogleAuthUrl } from "@/app/actions/google";

type Props = { calendarId: string | null; userId: string };

export function CalendarConnect({ calendarId, userId }: Props) {
  async function connect() {
    const url = await getGoogleAuthUrl(userId);
    window.location.href = url;
  }

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div>
        <p className="font-medium">Google Calendar</p>
        <p className="text-sm text-muted-foreground">
          {calendarId ? "Connected" : "Connect to sync appointments"}
        </p>
      </div>
      {calendarId ? (
        <span className="text-sm text-green-600">Connected</span>
      ) : (
        <Button onClick={connect} variant="outline">
          Connect Google Calendar
        </Button>
      )}
    </div>
  );
}
