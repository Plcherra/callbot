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
  const showPaymentSuccess = Boolean(params.session_id);

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, phone, calendar_id, bot_active")
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

        {showPaymentSuccess && (
          <Alert variant="success" className="mt-6">
            <AlertTitle>Payment complete</AlertTitle>
            <AlertDescription>
              Your subscription is activating. Refresh the page in a moment to
              see the full dashboard and connect Google Calendar.
            </AlertDescription>
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
        <h1 className="text-2xl font-bold">Dashboard</h1>
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
