"use client";

import { Button } from "@/app/components/ui/button";
import { getSubscriptionPlans, publicSubscriptionPlanIds, type PlanId } from "@/app/lib/plans";
import type { BillingPlanMetadata } from "./types";

type Props = {
  subscriptionStatus: string;
  hasStripeCustomer: boolean;
  billingPlan?: string | null;
  billingPlanMetadata?: BillingPlanMetadata;
  changePlanLoadingId: PlanId | null;
  portalLoading: boolean;
  onBillingPortal: () => void;
  onChangePlan: (id: PlanId) => void;
  isCurrentPlan: (planId: string, planLabel: string) => boolean;
};

export function PlanList(props: Props) {
  const plans = getSubscriptionPlans().filter((p) => publicSubscriptionPlanIds.includes(p.id));
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {plans.map((plan) => {
        const label = `${plan.name} (${plan.includedMinutes} min)`;
        const current = props.isCurrentPlan(plan.id, label) || props.billingPlan === plan.billingPlanId;
        return (
          <div key={plan.id} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-medium text-sm">{plan.name}</p>
              <p className="text-xs text-muted-foreground">{plan.includedMinutes} min · ${(plan.priceCents / 100).toFixed(0)}/mo</p>
            </div>
            {current ? <span className="text-xs text-muted-foreground">Current</span> : props.hasStripeCustomer ? (
              <Button size="sm" variant="outline" onClick={props.onBillingPortal} disabled={props.portalLoading}>Change in portal</Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => props.onChangePlan(plan.id)} disabled={props.changePlanLoadingId !== null}>
                {props.changePlanLoadingId === plan.id ? "Redirecting…" : "Select"}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
