"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/components/ui/tooltip";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { createReceptionist } from "@/app/actions/createReceptionist";

const CONSENT_GUIDE_URL = "/call-recording-laws";

type Props = {
  defaultCalendarId: string;
  defaultPhone: string | null;
  /** When false, refresh instead of redirecting to receptionist detail (e.g. for onboarding flow) */
  redirectToDetailOnSuccess?: boolean;
};

export function AddReceptionistForm({ defaultCalendarId, defaultPhone, redirectToDetailOnSuccess = true }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [calendarId, setCalendarId] = useState(defaultCalendarId);
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setConsentError(null);
    setSuccess(false);

    if (!consentChecked) {
      setConsentError("You must confirm consent before creating the receptionist.");
      return;
    }

    setLoading(true);
    const result = await createReceptionist({ name, phone_number: phone, calendar_id: calendarId });
    setLoading(false);
    if (result.success && result.id && redirectToDetailOnSuccess) {
      router.push(`/receptionists/${result.id}?created=1`);
    } else if (result.success) {
      setSuccess(true);
      setName("");
      setPhone(defaultPhone ?? "");
      setCalendarId(defaultCalendarId);
      setConsentChecked(false);
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>+ Add Receptionist</CardTitle>
        <CardDescription>
          Create a new AI assistant. Name, phone, and calendar ID are required. Calls are recorded for quality and training purposes; ensure compliance with local recording laws (e.g., TCPA, state consent rules). You will be required to confirm consent below.
        </CardDescription>
        {(defaultCalendarId || defaultPhone) && (
          <p className="text-sm text-muted-foreground">
            Using defaults from Settings. You can change these for this receptionist.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="rec-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="rec-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main line"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="rec-phone" className="text-sm font-medium">
              Phone number
            </label>
            <Input
              id="rec-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+15551234567"
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="rec-calendar" className="text-sm font-medium">
              Calendar ID
            </label>
            <Input
              id="rec-calendar"
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              placeholder="primary or email@example.com"
              required
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert variant="success">
              <AlertDescription>Receptionist created. Refresh to see it in the list.</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <Checkbox
                id="consent-checkbox"
                checked={consentChecked}
                onCheckedChange={(checked) => {
                  setConsentChecked(checked === true);
                  setConsentError(null);
                }}
                aria-invalid={!!consentError}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1">
                <label
                  htmlFor="consent-checkbox"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-1.5"
                >
                  I confirm that I have obtained all necessary consents for call recording and AI interaction in my jurisdiction (required)
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex text-muted-foreground hover:text-foreground cursor-help"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        <Info className="h-4 w-4 shrink-0" aria-hidden />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm">
                      <p className="mb-2">
                        In many U.S. states (e.g. California, Florida, Illinois), all-party consent is required for recording phone calls. You are responsible for complying with TCPA, state wiretapping laws, and obtaining verbal or written consent from callers when necessary.
                      </p>
                      <Link
                        href={CONSENT_GUIDE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2 hover:text-primary/90 font-medium"
                      >
                        Read our short guide to call recording laws by state →
                      </Link>
                    </TooltipContent>
                  </Tooltip>
                </label>
                {consentError && (
                  <p className="text-sm text-destructive">{consentError}</p>
                )}
              </div>
            </div>
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create receptionist"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
