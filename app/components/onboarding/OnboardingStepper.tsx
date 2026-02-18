"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { CalendarConnect } from "@/app/components/dashboard/CalendarConnect";
import { PhoneInput } from "@/app/components/dashboard/PhoneInput";
import { AddReceptionistForm } from "@/app/components/receptionists/AddReceptionistForm";
import { completeOnboarding, completeOnboardingAndRedirect } from "@/app/actions/onboarding";

const STEPS = [
  { id: 1, label: "Connect Calendar" },
  { id: 2, label: "Add Phone" },
  { id: 3, label: "Create Receptionist" },
  { id: 4, label: "Test Call" },
] as const;

type Props = {
  hasCalendar: boolean;
  hasPhone: boolean;
  hasReceptionist: boolean;
  testCallNumber: string | null;
  userId: string;
  calendarId: string;
  phone: string | null;
  isSubscribed: boolean;
};

export function OnboardingStepper({
  hasCalendar,
  hasPhone,
  hasReceptionist,
  testCallNumber,
  userId,
  calendarId,
  phone,
  isSubscribed,
}: Props) {
  const router = useRouter();
  const currentStep = !hasCalendar ? 1 : !hasPhone ? 2 : !hasReceptionist ? 3 : 4;

  async function handleComplete() {
    await completeOnboarding();
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="text-base">Setup steps</CardTitle>
        <p className="text-sm text-muted-foreground">
          Complete each step to get your AI receptionist running.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stepper progress */}
        <div
          className="flex min-w-0 items-center justify-between gap-0.5 text-center sm:gap-1"
          aria-label="Setup progress"
        >
          {STEPS.map((step, i) => {
            const done =
              step.id === 1
                ? hasCalendar
                : step.id === 2
                  ? hasPhone
                  : step.id === 3
                    ? hasReceptionist
                    : hasReceptionist && !!testCallNumber;
            return (
              <div key={step.id} className="flex flex-1 items-center">
                <div
                  className={`mx-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                    done
                      ? "bg-green-600 text-white dark:bg-green-500"
                      : currentStep === step.id
                        ? "border-2 border-primary bg-primary/10 text-primary"
                        : "border border-muted-foreground/40 bg-muted/50 text-muted-foreground"
                  }`}
                >
                  {done ? "✓" : step.id}
                </div>
                {i < STEPS.length - 1 && <div className="h-0.5 flex-1 bg-muted" />}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div>
              <p className="font-medium">1. Connect Google Calendar</p>
              <p className="text-sm text-muted-foreground">
                Required for booking and availability.
              </p>
            </div>
            {hasCalendar ? (
              <p className="text-sm text-green-600 dark:text-green-400">Calendar connected. Continuing…</p>
            ) : (
              <CalendarConnect calendarId={calendarId} userId={userId} returnTo="onboarding" />
            )}
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-4">
            <div>
              <p className="font-medium">2. Set your default business phone</p>
              <p className="text-sm text-muted-foreground">
                Used when creating new receptionists.
              </p>
            </div>
            {hasPhone ? (
              <p className="text-sm text-green-600 dark:text-green-400">Phone saved. Continuing…</p>
            ) : (
              <div className="space-y-4">
                <PhoneInput initialPhone={phone} />
                <Button variant="outline" onClick={() => router.refresh()}>
                  Continue
                </Button>
              </div>
            )}
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-4">
            <div>
              <p className="font-medium">3. Create your first receptionist</p>
              <p className="text-sm text-muted-foreground">
                Each receptionist gets a dedicated phone number. Name it &quot;Main Line&quot; or similar.
              </p>
            </div>
            {hasReceptionist ? (
              <p className="text-sm text-green-600 dark:text-green-400">Receptionist created. Continuing…</p>
            ) : isSubscribed ? (
              <AddReceptionistForm
                defaultCalendarId={calendarId}
                defaultPhone={phone}
                redirectToDetailOnSuccess={false}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                You need an active subscription.{" "}
                <Link href="/dashboard" className="text-primary underline">
                  Upgrade first
                </Link>
                .
              </p>
            )}
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-4">
            <div>
              <p className="font-medium">4. Test call</p>
              <p className="text-sm text-muted-foreground">
                Call your AI receptionist to hear it in action.
              </p>
            </div>
            {testCallNumber ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center dark:border-green-900 dark:bg-green-950/30">
                <p className="font-medium">Your AI is live!</p>
                <p className="mt-2 text-2xl font-bold">{testCallNumber}</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  <Button asChild>
                    <a href={`tel:${testCallNumber}`}>Call Now</a>
                  </Button>
                  <Button onClick={handleComplete}>Go to dashboard</Button>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  Try asking it to book an appointment.
                </p>
              </div>
            ) : hasReceptionist ? (
              <p className="text-sm text-muted-foreground">
                Your number will appear shortly. Refresh the page or{" "}
                <Link href="/receptionists" className="text-primary underline">
                  check Receptionists
                </Link>
                .
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Create a receptionist first.</p>
            )}
          </div>
        )}

        <form action={completeOnboardingAndRedirect} className="pt-4">
          <Button type="submit" variant="secondary">
            I&apos;ll do this later
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
