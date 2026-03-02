"use client";

import { Button } from "@/app/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";

type Props = {
  /** Callable phone number (E.164). Section is hidden when absent. */
  inboundPhoneNumber: string | null | undefined;
  /** Show "just created" success alert above the call card */
  showCreatedAlert?: boolean;
  /** Optional hint text below the Call button */
  hint?: string;
};

/**
 * Reusable "Your AI is live—call to test" section.
 * Shown when the receptionist has a callable number (Telnyx).
 */
export function CallNowSection({
  inboundPhoneNumber,
  showCreatedAlert = false,
  hint = "Try asking it to book an appointment.",
}: Props) {
  if (!inboundPhoneNumber?.trim()) {
    return null;
  }

  const number = inboundPhoneNumber.trim();

  return (
    <>
      {showCreatedAlert && (
        <Alert className="mt-6 border-green-500 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
          <AlertTitle className="text-green-800 dark:text-green-200">
            Your AI is live—call now to test!
          </AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-300">
            Your receptionist was just created. Call the number below to hear it in action.
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-8 rounded-lg border border-green-200 bg-green-50 p-6 text-center dark:border-green-900 dark:bg-green-950/30">
        <h3 className="text-lg font-semibold">Your AI Receptionist is Live!</h3>
        <p className="mt-2">Call this number to test it right now:</p>
        <p className="mt-4 text-2xl font-bold">{number}</p>
        <Button className="mt-6" asChild>
          <a href={`tel:${number}`}>Call Now</a>
        </Button>
        <p className="mt-4 text-sm text-muted-foreground">{hint}</p>
      </div>
    </>
  );
}
