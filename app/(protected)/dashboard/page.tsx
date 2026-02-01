import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { Button } from "@/app/components/ui/button";
import { SignOutButton } from "@/app/components/dashboard/SignOutButton";
import { AppNav } from "@/app/components/dashboard/AppNav";
import { UpgradeCard } from "@/app/components/dashboard/UpgradeCard";
import { CalendarConnect } from "@/app/components/dashboard/CalendarConnect";
import { PhoneInput } from "@/app/components/dashboard/PhoneInput";
import { BotStatus } from "@/app/components/dashboard/BotStatus";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";
import { Card, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { syncSubscriptionFromSession } from "@/app/actions/syncSubscription";
import { DashboardRefresh } from "@/app/components/dashboard/DashboardRefresh";

type SearchParams = { session_id?: string };

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

  // Fallback: if user just returned from Checkout with session_id, sync status from Stripe so they see "Active" immediately
  if (sessionId) {
    const { synced } = await syncSubscriptionFromSession(sessionId, user.id);
    if (synced) {
      redirect("/dashboard");
    }
  }

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, stripe_customer_id, phone, calendar_id, bot_active")
    .eq("id", user.id)
    .single();

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
          Connect calendar to start. Upgrade to Pro for the full AI bot.
        </p>

        {sessionId && (
          <Alert className="mt-6">
            <AlertTitle>Payment received</AlertTitle>
            <AlertDescription>
              Payment may take a moment to process. Click Refresh below or wait
              about 30 seconds and refresh the page.
            </AlertDescription>
            <DashboardRefresh className="mt-3" />
          </Alert>
        )}

        <div className="mt-8">
          <UpgradeCard userId={user.id} />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <Badge variant="success">Active – $29/mo</Badge>
        </div>
        <div className="flex items-center gap-2">
          <AppNav />
          <SignOutButton />
        </div>
      </div>
      <p className="mt-1 text-muted-foreground">
        Set up your AI receptionist and manage assistants.
      </p>

      {/* Receptionists section */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">My Receptionists</h2>
          <Button asChild size="sm">
            <Link href="/receptionists">+ Add Receptionist</Link>
          </Button>
        </div>
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

      <div className="mt-8 space-y-6">
        <CalendarConnect
          calendarId={profile?.calendar_id ?? null}
          userId={user.id}
        />
        <div className="rounded-lg border p-4">
          <PhoneInput initialPhone={profile?.phone ?? null} />
        </div>
        <BotStatus botActive={profile?.bot_active ?? false} />
      </div>
    </main>
  );
}
