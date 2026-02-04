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
import { subscriptionPlans, perMinutePlans, type PlanId } from "@/app/lib/plans";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const BUY_BUTTON_ID = process.env.NEXT_PUBLIC_STRIPE_BUY_BUTTON_ID;

type Props = { userId: string };

export function UpgradeCard({ userId }: Props) {
  const [loadingPlanId, setLoadingPlanId] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade(planId: PlanId) {
    setLoadingPlanId(planId);
    setError(null);
    const result = await createCheckoutSession(planId);
    setLoadingPlanId(null);
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
          <CardTitle>Choose a plan</CardTitle>
          <CardDescription>
            Connect calendar to start. Pick a subscription or pay-as-you-go tier.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">Subscription (included minutes)</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {subscriptionPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="flex flex-col rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div>
                    <p className="font-medium">{plan.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {plan.includedMinutes} min · ${(plan.priceCents / 100).toFixed(0)}/mo
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={loadingPlanId !== null}
                  >
                    {loadingPlanId === plan.id ? "Redirecting…" : "Select"}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">Pay as you go</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {perMinutePlans.map((plan) => (
                <div
                  key={plan.id}
                  className="flex flex-col rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div>
                    <p className="font-medium text-sm">{plan.name}</p>
                    <p className="text-xs text-muted-foreground">
                      ${(plan.monthlyFeeCents / 100).toFixed(0)} + ${(plan.perMinuteCents / 100).toFixed(2)}/min
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={loadingPlanId !== null}
                  >
                    {loadingPlanId === plan.id ? "Redirecting…" : "Select"}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {PUBLISHABLE_KEY && BUY_BUTTON_ID && (
            <div className="flex justify-center [&_stripe-buy-button]:min-h-[40px] pt-2">
              <stripe-buy-button
                buy-button-id={BUY_BUTTON_ID}
                publishable-key={PUBLISHABLE_KEY}
                client-reference-id={userId}
              />
            </div>
          )}
        </CardContent>
        <CardFooter className="text-muted-foreground text-sm">
          After payment you can connect Google Calendar and activate your AI assistant.
        </CardFooter>
      </Card>
    </>
  );
}
