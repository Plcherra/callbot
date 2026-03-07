export type BillingPlanMetadata = {
  included_minutes?: number;
  monthly_fee_cents?: number;
  per_minute_cents?: number;
} | null;

export type SettingsTabsProps = {
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
  inboundPercent?: number;
  outboundPercent?: number;
};
