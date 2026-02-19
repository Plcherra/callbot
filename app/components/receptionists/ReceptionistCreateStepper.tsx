"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { CalendarConnect } from "@/app/components/dashboard/CalendarConnect";
import { AddReceptionistForm } from "@/app/components/receptionists/AddReceptionistForm";

const STEPS = [
  { id: 1, label: "Connect Calendar" },
  { id: 2, label: "Create Receptionist" },
] as const;

type Props = {
  hasCalendar: boolean;
  userId: string;
  calendarId: string;
  defaultPhone: string | null;
};

export function ReceptionistCreateStepper({
  hasCalendar,
  userId,
  calendarId,
  defaultPhone,
}: Props) {
  const currentStep = !hasCalendar ? 1 : 2;

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="text-base">Create receptionist</CardTitle>
        <CardDescription>
          Complete each step. Calendar is required for booking and availability.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stepper progress */}
        <div
          className="flex min-w-0 items-center justify-between gap-0.5 text-center sm:gap-1"
          aria-label="Create receptionist progress"
        >
          {STEPS.map((step, i) => {
            const done = step.id === 1 ? hasCalendar : false;
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
              <p className="font-medium">Step 1: Connect Google Calendar</p>
              <p className="text-sm text-muted-foreground">
                Required for the AI to check availability and book appointments.
              </p>
            </div>
            <CalendarConnect
              calendarId={calendarId}
              userId={userId}
              returnTo="receptionists"
            />
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-4">
            <div>
              <p className="font-medium">Step 2: Create your receptionist</p>
              <p className="text-sm text-muted-foreground">
                Each receptionist gets a dedicated phone number. Name it &quot;Main Line&quot; or similar.
              </p>
            </div>
            <AddReceptionistForm
              defaultCalendarId={calendarId}
              defaultPhone={defaultPhone}
              redirectToDetailOnSuccess={true}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
