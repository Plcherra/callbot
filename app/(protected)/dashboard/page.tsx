import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { Button } from "@/app/components/ui/button";
import { SignOutButton } from "@/app/components/dashboard/SignOutButton";
import { UpgradeCard } from "@/app/components/dashboard/UpgradeCard";
import { CalendarConnect } from "@/app/components/dashboard/CalendarConnect";
import { PhoneInput } from "@/app/components/dashboard/PhoneInput";
import { BotStatus } from "@/app/components/dashboard/BotStatus";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";

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

  if (!isActive) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <SignOutButton />
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <SignOutButton />
      </div>
      <p className="mt-1 text-muted-foreground">
        Set up your AI receptionist below.
      </p>

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
