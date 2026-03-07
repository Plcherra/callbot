"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { Card, CardContent } from "@/app/components/ui/card";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/components/ui/tooltip";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import type { UseFormWatch, UseFormSetValue, FieldErrors } from "react-hook-form";
import type { ReceptionistWizardFormData } from "@/app/components/receptionists/wizard/schemas";
import { CONSENT_GUIDE_URL } from "./constants";

type Props = {
  watch: UseFormWatch<ReceptionistWizardFormData>;
  setValue: UseFormSetValue<ReceptionistWizardFormData>;
  errors: FieldErrors<ReceptionistWizardFormData>;
  submitError: string | null;
};

export function ReviewStep({ watch, setValue, errors, submitError }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">Review & create</p>
      <div className="grid gap-3">
        <Card>
          <CardContent className="pt-4 space-y-2">
            <p><span className="text-muted-foreground">Name:</span> {watch("name") || "—"}</p>
            <p><span className="text-muted-foreground">Country:</span> {watch("country")}</p>
            <p><span className="text-muted-foreground">Calendar:</span> {watch("calendar_id") || "—"}</p>
            <p>
              <span className="text-muted-foreground">Phone:</span>{" "}
              {watch("phone_strategy") === "new"
                ? `New number (${watch("area_code") || "—"})`
                : watch("own_phone") || "—"}
            </p>
            <p className="text-muted-foreground text-xs mt-2">
              Prompt: {(watch("system_prompt") || "").slice(0, 80)}...
            </p>
          </CardContent>
        </Card>
        <div className="flex items-start gap-2 rounded-lg border p-4">
          <Checkbox
            id="consent"
            checked={watch("consent")}
            onCheckedChange={(c) => setValue("consent", c === true)}
            className="mt-0.5"
          />
          <div className="flex-1">
            <label htmlFor="consent" className="text-sm font-medium leading-tight cursor-pointer flex items-center gap-1.5">
              I confirm that I have obtained all necessary consents for call recording and AI interaction.
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground hover:text-foreground cursor-help">
                    <Info className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="mb-2">In many U.S. states, all-party consent is required.</p>
                  <Link href={CONSENT_GUIDE_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    Call recording laws by state →
                  </Link>
                </TooltipContent>
              </Tooltip>
            </label>
            {errors.consent && (
              <p className="text-sm text-destructive mt-1">{errors.consent.message}</p>
            )}
          </div>
        </div>
      </div>
      {submitError && (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
