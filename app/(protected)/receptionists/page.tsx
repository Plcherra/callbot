import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { Button } from "@/app/components/ui/button";
import { SignOutButton } from "@/app/components/dashboard/SignOutButton";
import { AppNav } from "@/app/components/dashboard/AppNav";
import { ReceptionistsList } from "@/app/components/receptionists/ReceptionistsList";
import { ReceptionistCreateStepper } from "@/app/components/receptionists/ReceptionistCreateStepper";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";

export default async function ReceptionistsPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string; error?: string; message?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/signup");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, calendar_id, phone")
    .eq("id", user.id)
    .single();

  const isSubscribed = profile?.subscription_status === "active";
  const params = await searchParams;

  const { data: receptionists } = await supabase
    .from("receptionists")
    .select("id, name, phone_number, vapi_assistant_id, inbound_phone_number, status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">My Receptionists</h1>
        <div className="flex items-center gap-2">
          <AppNav />
          <SignOutButton />
        </div>
      </div>
      <p className="mt-1 text-muted-foreground">
        Manage your AI receptionist assistants.
      </p>

      {!isSubscribed ? (
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="font-medium">Upgrade to Pro</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You need an active subscription to add receptionists.
          </p>
          <Button asChild className="mt-4">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      ) : (
        <>
          {params.calendar === "connected" && (
            <Alert className="mt-8 border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
              <AlertTitle>Google Calendar connected</AlertTitle>
              <AlertDescription>
                You can now create your receptionist below.
              </AlertDescription>
            </Alert>
          )}
          {(params.calendar === "error" || params.error) && (
            <Alert variant="destructive" className="mt-8">
              <AlertTitle>Calendar connection failed</AlertTitle>
              <AlertDescription>
                {params.message
                  ? decodeURIComponent(params.message)
                  : "Failed to connect Google Calendar. Please try again in Settings → Integrations."}
              </AlertDescription>
            </Alert>
          )}
          <ReceptionistCreateStepper
            hasCalendar={Boolean(profile?.calendar_id?.trim())}
            userId={user.id}
            calendarId={profile?.calendar_id ?? ""}
            defaultPhone={profile?.phone ?? null}
          />
          <ReceptionistsList receptionists={receptionists ?? []} />
        </>
      )}
    </main>
  );
}
