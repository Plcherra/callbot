"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { activateBot } from "@/app/actions/activateBot";

type Props = { botActive: boolean };

export function BotStatus({ botActive }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(botActive);
  const [testNumber, setTestNumber] = useState<string | null>(null);

  async function handleActivate() {
    setLoading(true);
    setError(null);
    const result = await activateBot();
    setLoading(false);
    if (result.success) {
      setActive(true);
      if (result.testNumber) setTestNumber(result.testNumber);
    } else {
      setError(result.error);
    }
  }

  if (active) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-950/30">
        <div className="flex items-center gap-2">
          <Badge variant="success">Active</Badge>
          <span className="font-medium">Bot Status: Active</span>
        </div>
        {(testNumber || process.env.NEXT_PUBLIC_VAPI_TEST_CALL_NUMBER) && (
          <p className="mt-2 text-sm">
            Test call number: <strong>{testNumber || process.env.NEXT_PUBLIC_VAPI_TEST_CALL_NUMBER}</strong>
          </p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          Your bot is live! Callers will reach your AI receptionist.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-6">
      <p className="font-medium">Activate your AI receptionist</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect Calendar and add your phone number, then activate.
      </p>
      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
      <Button
        className="mt-4"
        onClick={handleActivate}
        disabled={loading}
      >
        {loading ? "Activating…" : "Activate My Bot"}
      </Button>
    </div>
  );
}
