"use client";

import { useState, useEffect } from "react";
import { Button } from "@/app/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";

type Props = {
  /** Callable phone number (E.164). Section is hidden when absent. */
  inboundPhoneNumber: string | null | undefined;
  /** Show "just created" success alert above the call card */
  showCreatedAlert?: boolean;
};

/** True when user is on a phone/tablet where tel: opens the native dialer. */
function useIsMobileDevice() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsMobile(
      /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      )
    );
  }, []);
  return isMobile;
}

/**
 * Reusable section for the business number.
 * On desktop: Copy only — user must call from their phone.
 * On mobile: Test call (tel:) opens native dialer.
 */
export function CallNowSection({
  inboundPhoneNumber,
  showCreatedAlert = false,
}: Props) {
  const isMobile = useIsMobileDevice();

  if (!inboundPhoneNumber?.trim()) {
    return null;
  }

  const number = inboundPhoneNumber.trim();

  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
    }
  };

  return (
    <>
      {showCreatedAlert && (
        <Alert className="mt-6 border-green-500 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
          <AlertTitle className="text-green-800 dark:text-green-200">
            Your AI receptionist is live!
          </AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-300">
            Give this number to your customers so they can call and book. Call it
            from your phone to test.
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-8 rounded-lg border border-green-200 bg-green-50 p-6 text-center dark:border-green-900 dark:bg-green-950/30">
        <h3 className="text-lg font-semibold">Your business number</h3>
        <p className="mt-2">
          Give this number to your customers so they can call and book.
        </p>
        <p className="mt-4 text-2xl font-bold">{number}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {isMobile ? (
            <>
              <Button asChild>
                <a href={`tel:${number}`}>Test call</a>
              </Button>
              <Button onClick={handleCopy} variant="outline">
                {copied ? "Copied!" : "Copy"}
              </Button>
            </>
          ) : (
            <Button onClick={handleCopy}>{copied ? "Copied!" : "Copy"}</Button>
          )}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {isMobile
            ? "Tap to open your phone dialer and call."
            : "Call this number from your phone to test the AI."}
        </p>
      </div>
    </>
  );
}
