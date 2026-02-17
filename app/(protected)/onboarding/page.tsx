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

      {/* Progress stepper: 1 → 2 → 3 → 4 → 5 */}
      <div className="mt-8 flex min-w-0 items-center justify-between gap-0.5 text-center sm:gap-1" aria-label="Setup progress">
        {[
          { done: hasCalendar, label: "Calendar" },
          { done: hasPhone, label: "Phone" },
          { done: hasReceptionist, label: "Receptionist" },
          { done: hasReceptionist && testCallNumber, label: "Test call" },
          { done: hasReceptionist, label: "Go live" },
        ].map((step, i) => (
          <div key={i} className="flex flex-1 items-center">
            <div
              className={`mx-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                step.done
                  ? "bg-green-600 text-white dark:bg-green-500"
                  : "border border-muted-foreground/40 bg-muted/50 text-muted-foreground"
              }`}
            >
              {step.done ? "✓" : i + 1}
            </div>
            {i < 4 && <div className="h-0.5 flex-1 bg-muted" />}
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        1. Connect Calendar · 2. Add Phone · 3. Create Receptionist · 4. Test Call · 5. Go Live
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
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">4. Test call</p>
              <p className="text-sm text-muted-foreground">
                Call your AI receptionist to hear it in action.
              </p>
            </div>
            {testCallNumber ? (
              <div className="text-right">
                <p className="text-sm font-mono font-medium">{testCallNumber}</p>
                <a href={`tel:${testCallNumber}`} className="text-xs text-primary underline">
                  Tap to call
                </a>
              </div>
            ) : hasReceptionist ? (
              <span className="text-sm text-muted-foreground">Number will appear after creation</span>
            ) : (
              <span className="text-sm text-muted-foreground">Create a receptionist first</span>
            )}
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">5. Go live</p>
              <p className="text-sm text-muted-foreground">
                You&apos;re ready. Head to the dashboard to manage receptionists.
              </p>
            </div>
            {hasReceptionist && (
              <Button asChild size="sm">
                <Link href="/dashboard">Go to dashboard</Link>
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
