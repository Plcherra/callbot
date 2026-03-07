"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { ProfileTab } from "@/features/settings/ProfileTab";
import { IntegrationsTab } from "@/features/settings/IntegrationsTab";
import { BillingTab } from "@/features/settings/BillingTab";
import { BusinessTab } from "@/features/settings/BusinessTab";
import { DeleteAccountTab } from "@/features/settings/DeleteAccountTab";
import type { SettingsTabsProps } from "@/features/settings/types";

export function SettingsTabs(props: SettingsTabsProps) {
  return (
    <Tabs defaultValue="profile" className="mt-8">
      <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="integrations">Integrations</TabsTrigger>
        <TabsTrigger value="billing">Billing</TabsTrigger>
        <TabsTrigger value="business">Business</TabsTrigger>
        <TabsTrigger value="account">Account</TabsTrigger>
      </TabsList>
      <TabsContent value="profile">
        <ProfileTab email={props.email} />
      </TabsContent>
      <TabsContent value="integrations">
        <IntegrationsTab calendarId={props.calendarId} phone={props.phone} userId={props.userId} />
      </TabsContent>
      <TabsContent value="billing">
        <BillingTab subscriptionStatus={props.subscriptionStatus} hasStripeCustomer={props.hasStripeCustomer} userId={props.userId} billingPlan={props.billingPlan} billingPlanMetadata={props.billingPlanMetadata} inboundPercent={props.inboundPercent} outboundPercent={props.outboundPercent} />
      </TabsContent>
      <TabsContent value="business">
        <BusinessTab businessName={props.businessName} businessAddress={props.businessAddress} />
      </TabsContent>
      <TabsContent value="account">
        <DeleteAccountTab />
      </TabsContent>
    </Tabs>
  );
}
