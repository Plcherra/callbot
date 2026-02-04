import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { Button } from "@/app/components/ui/button";
import { SignOutButton } from "@/app/components/dashboard/SignOutButton";
import { AppNav } from "@/app/components/dashboard/AppNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { completeOnboarding } from "@/app/actions/onboarding";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/signup");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("onboarding_completed_at, calendar_id, phone")
    .eq("id", user.id)
    .single();

  if (profile?.onboarding_completed_at) {
    redirect("/dashboard");
  }

  const hasCalendar = Boolean(profile?.calendar_id?.trim());
  const hasPhone = Boolean(profile?.phone?.trim());
  const { count: receptionistCount } = await supabase
    .from("receptionists")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);
  const hasReceptionist = (receptionistCount ?? 0) > 0;

  async function markComplete() {
    "use server";
    await completeOnboarding();
    redirect("/dashboard");
  }

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

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Setup steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">1. Connect Google Calendar</p>
              <p className="text-sm text-muted-foreground">
                Required for booking and availability.
              </p>
            </div>
            {hasCalendar ? (
              <span className="text-sm text-green-600 dark:text-green-400">Done</span>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href="/settings">Settings → Integrations</Link>
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">2. Add default phone</p>
              <p className="text-sm text-muted-foreground">
                Used when creating new receptionists.
              </p>
            </div>
            {hasPhone ? (
              <span className="text-sm text-green-600 dark:text-green-400">Done</span>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href="/settings">Settings → Integrations</Link>
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">3. Create your first receptionist</p>
              <p className="text-sm text-muted-foreground">
                Each receptionist gets a dedicated phone number.
              </p>
            </div>
            {hasReceptionist ? (
              <span className="text-sm text-green-600 dark:text-green-400">Done</span>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href="/receptionists">Receptionists → Add</Link>
              </Button>
            )}
          </div>

          <form action={markComplete} className="pt-4">
            <Button type="submit" variant="secondary">
              I&apos;ll do this later
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
