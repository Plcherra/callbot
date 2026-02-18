import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { SignOutButton } from "@/app/components/dashboard/SignOutButton";
import { AppNav } from "@/app/components/dashboard/AppNav";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";
import { OnboardingStepper } from "@/app/components/onboarding/OnboardingStepper";

type Props = { searchParams: Promise<{ calendar?: string; error?: string; message?: string }> };

export default async function OnboardingPage({ searchParams }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/signup");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("onboarding_completed_at, calendar_id, phone, subscription_status")
    .eq("id", user.id)
    .single();

  if (profile?.onboarding_completed_at) {
    redirect("/dashboard");
  }

  const hasCalendar = Boolean(profile?.calendar_id?.trim());
  const hasPhone = Boolean(profile?.phone?.trim());
  const isSubscribed = profile?.subscription_status === "active";

  const { data: receptionists } = await supabase
    .from("receptionists")
    .select("inbound_phone_number")
    .eq("user_id", user.id)
    .limit(1);
  const hasReceptionist = (receptionists?.length ?? 0) > 0;
  const testCallNumber =
    receptionists?.[0]?.inbound_phone_number?.trim() ||
    process.env.VAPI_TEST_CALL_NUMBER ||
    process.env.NEXT_PUBLIC_VAPI_TEST_CALL_NUMBER ||
    null;

  const params = await searchParams;
  const calendarStatus = params.calendar;
  const errorMessage = params.message;

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Finish setup</h1>
        <div className="flex items-center gap-2">
          <AppNav />
          <SignOutButton />
        </div>
      </div>
      <p className="mt-1 text-muted-foreground">
        Complete these steps to get the most out of your AI receptionist.
      </p>

      {calendarStatus === "connected" && (
        <Alert className="mt-6 border-green-500 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
          <AlertTitle className="text-green-800 dark:text-green-200">
            Google Calendar connected
          </AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-300">
            Continue with the next step below.
          </AlertDescription>
        </Alert>
      )}
      {(calendarStatus === "error" || params.error) && (
        <Alert className="mt-6 border-red-500 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
          <AlertTitle className="text-red-800 dark:text-red-200">
            Calendar connection failed
          </AlertTitle>
          <AlertDescription className="text-red-700 dark:text-red-300">
            {errorMessage
              ? decodeURIComponent(errorMessage)
              : "Please try again below."}
          </AlertDescription>
        </Alert>
      )}

      <OnboardingStepper
        hasCalendar={hasCalendar}
        hasPhone={hasPhone}
        hasReceptionist={hasReceptionist}
        testCallNumber={testCallNumber}
        userId={user.id}
        calendarId={profile?.calendar_id ?? ""}
        phone={profile?.phone ?? null}
        isSubscribed={isSubscribed}
      />
    </main>
  );
}
