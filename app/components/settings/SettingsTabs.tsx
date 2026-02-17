"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { updateBusiness, createBillingPortalSession } from "@/app/actions/settings";
import { createCheckoutSession } from "@/app/actions/upgrade";
import { createClient } from "@/app/lib/supabase/client";
import { CalendarConnect } from "@/app/components/dashboard/CalendarConnect";
import { PhoneInput } from "@/app/components/dashboard/PhoneInput";
import { getPlanDisplayLabel, getPlanPriceLabel, subscriptionPlans, perMinutePlans, type PlanId } from "@/app/lib/plans";

type BillingPlanMetadata = {
  included_minutes?: number;
  monthly_fee_cents?: number;
  per_minute_cents?: number;
} | null;

type Props = {
  email: string;
  subscriptionStatus: string;
  hasStripeCustomer: boolean;
  businessName: string;
  businessAddress: string;
  calendarId: string | null;
  phone: string | null;
  userId: string;
  billingPlan?: string | null;
  billingPlanMetadata?: BillingPlanMetadata;
};

export function SettingsTabs({
  email,
  subscriptionStatus,
  hasStripeCustomer,
  businessName,
  businessAddress,
  calendarId,
  phone,
  userId,
  billingPlan = null,
  billingPlanMetadata = null,
}: Props) {
  const [businessNameVal, setBusinessNameVal] = useState(businessName);
  const [businessAddressVal, setBusinessAddressVal] = useState(businessAddress);
  const [businessSaving, setBusinessSaving] = useState(false);
  const [businessMessage, setBusinessMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [passwordVal, setPasswordVal] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [changePlanLoadingId, setChangePlanLoadingId] = useState<PlanId | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);

  async function handleSaveBusiness(e: React.FormEvent) {
    e.preventDefault();
    setBusinessSaving(true);
    setBusinessMessage(null);
    const result = await updateBusiness({
      business_name: businessNameVal,
      business_address: businessAddressVal,
    });
    setBusinessSaving(false);
    if (result.success) {
      setBusinessMessage({ type: "success", text: "Saved." });
    } else {
      setBusinessMessage({ type: "error", text: result.error ?? "Failed to save." });
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (passwordVal !== passwordConfirm) {
      setPasswordMessage({ type: "error", text: "Passwords do not match." });
      return;
    }
    if (passwordVal.length < 6) {
      setPasswordMessage({ type: "error", text: "Password must be at least 6 characters." });
      return;
    }
    setPasswordSaving(true);
    setPasswordMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: passwordVal });
    setPasswordSaving(false);
    if (error) {
      setPasswordMessage({ type: "error", text: error.message });
    } else {
      setPasswordMessage({ type: "success", text: "Password updated." });
      setPasswordVal("");
      setPasswordConfirm("");
    }
  }

  async function handleBillingPortal() {
    setBillingError(null);
    setPortalLoading(true);
    const result = await createBillingPortalSession();
    setPortalLoading(false);
    if ("url" in result) {
      window.location.href = result.url;
    } else {
      setBillingError(result.error ?? "Could not open billing portal.");
    }
  }

  async function handleChangePlan(planId: PlanId) {
    setBillingError(null);
    setChangePlanLoadingId(planId);
    const result = await createCheckoutSession(planId);
    setChangePlanLoadingId(null);
    if ("url" in result) {
      window.location.href = result.url;
    } else {
      setBillingError(result.error ?? "Could not start checkout.");
    }
  }

  const isCurrentPlan = (planId: string, planLabel: string) => {
    if (subscriptionStatus !== "active" || !billingPlan) return false;
    const label = getPlanDisplayLabel(billingPlan, billingPlanMetadata ?? null);
    return label === planLabel || billingPlan === planId || billingPlan.replace("subscription_", "") === planId;
  };

  return (
    <Tabs defaultValue="profile" className="mt-8">
      <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="integrations">Integrations</TabsTrigger>
        <TabsTrigger value="billing">Billing</TabsTrigger>
        <TabsTrigger value="business">Business</TabsTrigger>
      </TabsList>

      <TabsContent value="profile">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Email and password</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label className="text-sm font-medium">Email</label>
              <p className="mt-1 text-sm text-muted-foreground">{email}</p>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="new-password" className="text-sm font-medium">
                  New password
                </label>
                <Input
                  id="new-password"
                  type="password"
                  value={passwordVal}
                  onChange={(e) => setPasswordVal(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="confirm-password" className="text-sm font-medium">
                  Confirm password
                </label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
              {passwordMessage && (
                <Alert variant={passwordMessage.type === "error" ? "destructive" : "default"}>
                  <AlertDescription>{passwordMessage.text}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" disabled={passwordSaving}>
                {passwordSaving ? "Updating…" : "Change password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="integrations">
        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>
              These settings are used as defaults when creating new receptionists.
              You can override them per receptionist.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <CalendarConnect calendarId={calendarId} userId={userId} />
            <div className="rounded-lg border p-4">
              <PhoneInput initialPhone={phone} />
            </div>
            <p className="text-xs text-muted-foreground">
              Calls are recorded. Ensure your business complies with local recording laws (e.g., TCPA, consent).
            </p>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="billing">
        <Card>
          <CardHeader>
            <CardTitle>Billing</CardTitle>
            <CardDescription>Current plan, change plan, and billing portal</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label className="text-sm font-medium">Current plan</label>
              <p className="mt-1 text-sm text-muted-foreground">
                {subscriptionStatus === "active"
                  ? `${getPlanDisplayLabel(billingPlan ?? null, billingPlanMetadata ?? null)}${getPlanPriceLabel(billingPlan ?? null, billingPlanMetadata ?? null) ? ` – ${getPlanPriceLabel(billingPlan ?? null, billingPlanMetadata ?? null)}` : ""}`
                  : "Free"}
              </p>
            </div>
            {billingError && (
              <Alert variant="destructive">
                <AlertDescription>{billingError}</AlertDescription>
              </Alert>
            )}
            <div>
              <h3 className="text-sm font-semibold mb-2">Change plan</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Subscription plans include fixed minutes per month. Pay-as-you-go plans charge a base fee plus per-minute usage.
              </p>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Subscription (included minutes)</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {subscriptionPlans.map((plan) => {
                    const label = `${plan.name} (${plan.includedMinutes} min)`;
                    const current = isCurrentPlan(plan.id, label) || (billingPlan === plan.billingPlanId);
                    return (
                      <div key={plan.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="font-medium text-sm">{plan.name}</p>
                          <p className="text-xs text-muted-foreground">{plan.includedMinutes} min · ${(plan.priceCents / 100).toFixed(0)}/mo</p>
                        </div>
                        {current ? (
                          <span className="text-xs text-muted-foreground">Current</span>
                        ) : hasStripeCustomer ? (
                          <Button size="sm" variant="outline" onClick={handleBillingPortal} disabled={portalLoading}>
                            Change in portal
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleChangePlan(plan.id)} disabled={changePlanLoadingId !== null}>
                            {changePlanLoadingId === plan.id ? "Redirecting…" : "Select"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs font-medium text-muted-foreground mt-3">Pay as you go</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {perMinutePlans.map((plan) => {
                    const current = billingPlan === "per_minute" && billingPlanMetadata?.monthly_fee_cents === plan.monthlyFeeCents && billingPlanMetadata?.per_minute_cents === plan.perMinuteCents;
                    return (
                      <div key={plan.id} className="flex flex-col gap-2 rounded-lg border p-3">
                        <div>
                          <p className="font-medium text-sm">{plan.name}</p>
                          <p className="text-xs text-muted-foreground">${(plan.monthlyFeeCents / 100).toFixed(0)} + ${(plan.perMinuteCents / 100).toFixed(2)}/min</p>
                        </div>
                        {current ? (
                          <span className="text-xs text-muted-foreground">Current</span>
                        ) : hasStripeCustomer ? (
                          <Button size="sm" variant="outline" onClick={handleBillingPortal} disabled={portalLoading}>
                            Change in portal
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleChangePlan(plan.id)} disabled={changePlanLoadingId !== null}>
                            {changePlanLoadingId === plan.id ? "Redirecting…" : "Select"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            {hasStripeCustomer && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Update payment method, view invoices, or cancel in the Stripe portal.
                </p>
                <Button onClick={handleBillingPortal} disabled={portalLoading}>
                  {portalLoading ? "Opening…" : "Manage billing (Stripe portal)"}
                </Button>
              </div>
            )}
            {!hasStripeCustomer && subscriptionStatus !== "active" && (
              <p className="text-sm text-muted-foreground">
                Select a plan above to upgrade. After payment you can manage billing in the Stripe portal.
              </p>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="business">
        <Card>
          <CardHeader>
            <CardTitle>Business</CardTitle>
            <CardDescription>Business name and address</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveBusiness} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="business-name" className="text-sm font-medium">
                  Business name
                </label>
                <Input
                  id="business-name"
                  value={businessNameVal}
                  onChange={(e) => setBusinessNameVal(e.target.value)}
                  placeholder="My Salon"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="business-address" className="text-sm font-medium">
                  Address
                </label>
                <Input
                  id="business-address"
                  value={businessAddressVal}
                  onChange={(e) => setBusinessAddressVal(e.target.value)}
                  placeholder="123 Main St, City"
                />
              </div>
              {businessMessage && (
                <Alert variant={businessMessage.type === "error" ? "destructive" : "default"}>
                  <AlertDescription>{businessMessage.text}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" disabled={businessSaving}>
                {businessSaving ? "Saving…" : "Save"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
