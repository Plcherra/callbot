"use client";

import { useState } from "react";
import Script from "next/script";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { createCheckoutSession } from "@/app/actions/upgrade";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const BUY_BUTTON_ID = process.env.NEXT_PUBLIC_STRIPE_BUY_BUTTON_ID;

type Props = { userId: string };

export function UpgradeCard({ userId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade() {
    setLoading(true);
    setError(null);
    const result = await createCheckoutSession();
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    window.location.href = result.url;
  }

  return (
    <>
      <Script
        src="https://js.stripe.com/v3/buy-button.js"
        strategy="afterInteractive"
      />
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Upgrade to Pro – $29/mo</CardTitle>
          <CardDescription>
            Connect calendar to start. Upgrade to Pro for the full AI
            receptionist (calls, booking, Google Calendar).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            className="w-full"
            size="lg"
            onClick={handleUpgrade}
            disabled={loading || !PUBLISHABLE_KEY}
          >
            {loading ? "Redirecting…" : "Upgrade to Pro – $29/mo"}
          </Button>
          {PUBLISHABLE_KEY && BUY_BUTTON_ID && (
            <div className="flex justify-center [&_stripe-buy-button]:min-h-[40px]">
              <stripe-buy-button
                buy-button-id={BUY_BUTTON_ID}
                publishable-key={PUBLISHABLE_KEY}
                client-reference-id={userId}
              />
            </div>
          )}
        </CardContent>
        <CardFooter className="text-muted-foreground text-sm">
          After payment you can connect Google Calendar and activate your bot.
        </CardFooter>
      </Card>
    </>
  );
}
