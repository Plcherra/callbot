import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { SignOutButton } from "@/app/components/dashboard/SignOutButton";
import { AppNav } from "@/app/components/dashboard/AppNav";
import { SettingsTabs } from "@/app/components/settings/SettingsTabs";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/signup");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, stripe_customer_id, business_name, business_address, calendar_id, phone, billing_plan, billing_plan_metadata")
    .eq("id", user.id)
    .single();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <div className="flex items-center gap-2">
          <AppNav />
          <SignOutButton />
        </div>
      </div>

      <SettingsTabs
        email={user.email ?? ""}
        subscriptionStatus={profile?.subscription_status ?? "inactive"}
        hasStripeCustomer={Boolean(profile?.stripe_customer_id)}
        businessName={profile?.business_name ?? ""}
        businessAddress={profile?.business_address ?? ""}
        calendarId={profile?.calendar_id ?? null}
        phone={profile?.phone ?? null}
        userId={user.id}
        billingPlan={profile?.billing_plan ?? null}
        billingPlanMetadata={profile?.billing_plan_metadata as { included_minutes?: number; monthly_fee_cents?: number; per_minute_cents?: number } | null ?? null}
      />
    </main>
  );
}
