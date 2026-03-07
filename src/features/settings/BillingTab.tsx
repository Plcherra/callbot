"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { createBillingPortalSession } from "@/app/actions/settings";
import { createCheckoutSession } from "@/app/actions/upgrade";
import { syncBillingPlanFromStripe } from "@/app/actions/syncSubscription";
import { getPlanDisplayLabel, getPlanPriceLabel, type PlanId } from "@/app/lib/plans";
import type { BillingPlanMetadata } from "./types";
import { PlanList } from "./PlanList";
import { PlanSplitForm } from "./PlanSplitForm";

type Props = {
  subscriptionStatus: string;
  hasStripeCustomer: boolean;
  userId: string;
  billingPlan?: string | null;
  billingPlanMetadata?: BillingPlanMetadata;
  inboundPercent?: number;
  outboundPercent?: number;
};

export function BillingTab({ subscriptionStatus, hasStripeCustomer, userId, billingPlan = null, billingPlanMetadata = null, inboundPercent = 80, outboundPercent = 20 }: Props) {
  const router = useRouter();
  const [portalLoading, setPortalLoading] = useState(false);
  const [changePlanLoadingId, setChangePlanLoadingId] = useState<PlanId | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [syncPlanLoading, setSyncPlanLoading] = useState(false);
  const isCurrentPlan = (planId: string, planLabel: string) => {
    if (subscriptionStatus !== "active" || !billingPlan) return false;
    const label = getPlanDisplayLabel(billingPlan, billingPlanMetadata ?? null);
    return label === planLabel || billingPlan === planId || billingPlan.replace("subscription_", "") === planId;
  };

  const handleBillingPortal = async () => {
    setBillingError(null); setPortalLoading(true);
    const result = await createBillingPortalSession();
    setPortalLoading(false);
    if ("url" in result) window.location.href = result.url; else setBillingError(result.error ?? "Could not open portal.");
  };

  const handleChangePlan = async (planId: PlanId) => {
    setBillingError(null); setChangePlanLoadingId(planId);
    const result = await createCheckoutSession(planId);
    setChangePlanLoadingId(null);
    if ("url" in result) window.location.href = result.url; else setBillingError(result.error ?? "Could not start checkout.");
  };

  const showSplit = subscriptionStatus === "active" && billingPlan && billingPlan !== "subscription_payg";
  const currentPlanLabel = subscriptionStatus === "active" ? getPlanDisplayLabel(billingPlan ?? null, billingPlanMetadata ?? null) : "Free";
  const priceLabel = subscriptionStatus === "active" ? getPlanPriceLabel(billingPlan ?? null, billingPlanMetadata ?? null) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
        <CardDescription>Current plan, change plan, and billing portal</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label className="text-sm font-medium">Current plan</label>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-sm text-muted-foreground">{currentPlanLabel}{priceLabel ? ` – ${priceLabel}` : ""}</p>
            {subscriptionStatus === "active" && !billingPlan && hasStripeCustomer && (
              <Button size="sm" variant="outline" disabled={syncPlanLoading} onClick={async () => {
                setSyncPlanLoading(true); setBillingError(null);
                const { synced } = await syncBillingPlanFromStripe(userId);
                setSyncPlanLoading(false);
                if (synced) router.refresh(); else setBillingError("Could not sync plan.");
              }}>{syncPlanLoading ? "Syncing…" : "Sync plan"}</Button>
            )}
          </div>
        </div>
        {billingError && <Alert variant="destructive"><AlertDescription>{billingError}</AlertDescription></Alert>}
        <div>
          <h3 className="text-sm font-semibold mb-2">Change plan</h3>
          <p className="text-sm text-muted-foreground mb-3">Subscription plans include minutes per month.</p>
          <PlanList subscriptionStatus={subscriptionStatus} hasStripeCustomer={hasStripeCustomer} billingPlan={billingPlan} billingPlanMetadata={billingPlanMetadata} changePlanLoadingId={changePlanLoadingId} portalLoading={portalLoading} onBillingPortal={handleBillingPortal} onChangePlan={handleChangePlan} isCurrentPlan={isCurrentPlan} />
        </div>
        {showSplit && <PlanSplitForm inboundPercent={inboundPercent} />}
        {hasStripeCustomer && (
          <div>
            <p className="text-sm text-muted-foreground mb-2">Update payment or view invoices in Stripe portal.</p>
            <Button onClick={handleBillingPortal} disabled={portalLoading}>{portalLoading ? "Opening…" : "Manage billing (Stripe portal)"}</Button>
          </div>
        )}
        {!hasStripeCustomer && subscriptionStatus !== "active" && <p className="text-sm text-muted-foreground">Select a plan above to upgrade.</p>}
      </CardContent>
    </Card>
  );
}
