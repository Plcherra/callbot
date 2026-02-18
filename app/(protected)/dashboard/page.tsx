import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { Button } from "@/app/components/ui/button";
import { SignOutButton } from "@/app/components/dashboard/SignOutButton";
import { AppNav } from "@/app/components/dashboard/AppNav";
import { UpgradeCard } from "@/app/components/dashboard/UpgradeCard";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";
import { Card, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Skeleton } from "@/app/components/ui/skeleton";
import { syncSubscriptionFromSession } from "@/app/actions/syncSubscription";
import { DashboardRefresh } from "@/app/components/dashboard/DashboardRefresh";
import { getCurrentPeriod } from "@/app/lib/usage";
import { getPlanDisplayLabel, getPlanPriceLabel } from "@/app/lib/plans";

type SearchParams = {
  session_id?: string;
  calendar?: string;
  error?: string;
  message?: string;
  plan?: string;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/signup");
  }

  const params = await searchParams;
  const sessionId = params.session_id;
  const calendarStatus = params.calendar;
  const errorMessage = params.message;

  // Fallback: if user just returned from Checkout with session_id, sync status from Stripe so they see "Active" immediately
  if (sessionId) {
    const { synced } = await syncSubscriptionFromSession(sessionId, user.id);
    if (synced) {
      redirect("/dashboard");
    }
  }

  let { data: profile } = await supabase
    .from("users")
    .select("subscription_status, stripe_customer_id, stripe_subscription_id, phone, calendar_id, bot_active, billing_plan, billing_plan_metadata, onboarding_completed_at")
    .eq("id", user.id)
    .single();

  // Re-sync billing_plan if active but missing (e.g. subscribed before we added plan sync)
  if (profile?.subscription_status === "active" && profile?.stripe_subscription_id && !profile?.billing_plan) {
    const { syncBillingPlanFromStripe } = await import("@/app/actions/syncSubscription");
    const { synced } = await syncBillingPlanFromStripe(user.id);
    if (synced) {
      const { data: refreshed } = await supabase
        .from("users")
        .select("subscription_status, stripe_customer_id, phone, calendar_id, bot_active, billing_plan, billing_plan_metadata, onboarding_completed_at")
        .eq("id", user.id)
        .single();
      profile = refreshed ?? profile;
    }
  }

  const isActive = profile?.subscription_status === "active";

  const { data: receptionists } = isActive
    ? await supabase
        .from("receptionists")
        .select("id, name, phone_number, status")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(6)
    : { data: [] };

  const { count: totalReceptionists } = isActive
    ? await supabase
        .from("receptionists")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
    : { count: 0 };

  const { count: activeReceptionists } = isActive
    ? await supabase
        .from("receptionists")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "active")
    : { count: 0 };

  const { period_start: usagePeriodStart } = getCurrentPeriod();
  const { data: usageRows } = isActive
    ? await supabase
        .from("usage_snapshots")
        .select("total_seconds, overage_minutes")
        .eq("user_id", user.id)
        .eq("period_start", usagePeriodStart)
    : { data: [] };
  const totalUsageSeconds = usageRows?.reduce((s, r) => s + (r.total_seconds ?? 0), 0) ?? 0;
  const totalUsageMinutes = Math.ceil(totalUsageSeconds / 60);
  const billingMetadata = profile?.billing_plan_metadata as { included_minutes?: number; monthly_fee_cents?: number; per_minute_cents?: number } | null | undefined;
  const includedMinutes = typeof billingMetadata?.included_minutes === "number" ? billingMetadata.included_minutes : null;
  const overageMinutes = usageRows?.reduce((s, r) => s + (r.overage_minutes ?? 0), 0) ?? 0;
  const isOverCap = includedMinutes != null && totalUsageMinutes >= includedMinutes;

  if (!isActive) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-2">
            <AppNav />
            <SignOutButton />
          </div>
        </div>
        <p className="mt-1 text-muted-foreground">
          Connect calendar to start. Upgrade to Pro for your AI assistant.
        </p>

        {sessionId && (
          <Alert className="mt-6">
            <AlertTitle>Payment received – activating your subscription...</AlertTitle>
            <AlertDescription>
              If your plan isn&apos;t active yet, click Refresh below or wait a
              moment and refresh the page.
            </AlertDescription>
            <DashboardRefresh className="mt-3" />
          </Alert>
        )}

        <div className="mt-8">
          {sessionId && (
            <Skeleton className="mb-4 h-24 w-full rounded-lg" />
          )}
          <UpgradeCard userId={user.id} selectedPlanId={params.plan ?? undefined} />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <Badge variant="success">
            Active – {getPlanDisplayLabel(profile?.billing_plan ?? null, billingMetadata ?? null)}
            {getPlanPriceLabel(profile?.billing_plan ?? null, billingMetadata ?? null)
              ? ` (${getPlanPriceLabel(profile?.billing_plan ?? null, billingMetadata ?? null)})`
              : ""}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <AppNav />
          <SignOutButton />
        </div>
      </div>
      <p className="mt-1 text-muted-foreground">
        Overview of your AI receptionists and quick actions.
      </p>

      {!profile?.onboarding_completed_at && (
        <Alert className="mt-6 border-blue-500 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
          <AlertTitle className="text-blue-800 dark:text-blue-200">
            Finish setup
          </AlertTitle>
          <AlertDescription className="text-blue-700 dark:text-blue-300">
            Connect calendar, add phone, and create your first receptionist.{" "}
            <Link href="/onboarding" className="underline">
              Go to onboarding
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Calendar connection status messages (from OAuth redirect) */}
      {calendarStatus === "connected" && (
        <Alert className="mt-6 border-green-500 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
          <AlertTitle className="text-green-800 dark:text-green-200">
            ✓ Google Calendar Connected
          </AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-300">
            Your Google Calendar has been successfully connected. Set defaults in{" "}
            <Link href="/settings" className="underline">
              Settings → Integrations
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}
      {(calendarStatus === "error" || params.error) && (
        <Alert className="mt-6 border-red-500 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
          <AlertTitle className="text-red-800 dark:text-red-200">
            Calendar Connection Failed
          </AlertTitle>
          <AlertDescription className="text-red-700 dark:text-red-300">
            {errorMessage
              ? decodeURIComponent(errorMessage)
              : "Failed to connect Google Calendar. Please try again in Settings → Integrations."}
          </AlertDescription>
        </Alert>
      )}

      {/* Statistics cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">
              Total Receptionists
            </p>
            <p className="mt-1 text-2xl font-bold">{totalReceptionists ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">
              Active Receptionists
            </p>
            <p className="mt-1 text-2xl font-bold">{activeReceptionists ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">
              Calendar
            </p>
            <div className="mt-1">
              {profile?.calendar_id ? (
                <Badge variant="success">Connected</Badge>
              ) : (
                <Badge variant="secondary">Not connected</Badge>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">
              Default phone
            </p>
            <p className="mt-1 text-sm">
              {profile?.phone ? (
                <span className="font-medium">{profile.phone}</span>
              ) : (
                <span className="text-muted-foreground">Not set</span>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-muted-foreground">
              Minutes this period
            </p>
            <p className="mt-1 text-2xl font-bold">
              {includedMinutes != null
                ? `${totalUsageMinutes} / ${includedMinutes}`
                : `${totalUsageMinutes}`}
            </p>
            {isOverCap && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Over included minutes; overage may be billed.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent receptionists */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold">Recent Receptionists</h2>
        {receptionists && receptionists.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {receptionists.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-sm text-muted-foreground">{r.phone_number}</p>
                  </div>
                  <Badge variant="success">{r.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No receptionists yet.{" "}
            <Link href="/receptionists" className="text-primary underline">
              Add one
            </Link>
            .
          </p>
        )}
      </div>
    </main>
  );
}
