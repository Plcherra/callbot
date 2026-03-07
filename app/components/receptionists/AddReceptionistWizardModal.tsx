"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { receptionistWizardSchema, type ReceptionistWizardFormData, DEFAULT_SYSTEM_PROMPT } from "@/app/components/receptionists/wizard/schemas";
import { useWizardStorageRestore, useWizardStoragePersist } from "@/features/receptionists/wizard/useWizardStorage";
import { useWizardSubmit } from "@/features/receptionists/wizard/useWizardSubmit";
import { WizardStepper } from "@/features/receptionists/wizard/WizardStepper";
import { BasicsStep } from "@/features/receptionists/wizard/BasicsStep";
import { PhoneStep } from "@/features/receptionists/wizard/PhoneStep";
import { InstructionsStep } from "@/features/receptionists/wizard/InstructionsStep";
import { BusinessStep } from "@/features/receptionists/wizard/BusinessStep";
import { AdvancedStep } from "@/features/receptionists/wizard/AdvancedStep";
import { ReviewStep } from "@/features/receptionists/wizard/ReviewStep";
import { SuccessStep } from "@/features/receptionists/wizard/SuccessStep";

const defaultValues: ReceptionistWizardFormData = {
  name: "", country: "US", calendar_id: "", phone_strategy: "new", area_code: "212",
  own_phone: "", provider_sid: "", system_prompt: DEFAULT_SYSTEM_PROMPT, staff: [],
  promotions: "", business_hours: "", voice_personality: "friendly", fallback_behavior: "voicemail",
  max_call_duration_minutes: null, consent: false,
};

type Props = { open: boolean; onOpenChange: (open: boolean) => void; defaultCalendarId: string; redirectToDetailOnSuccess?: boolean };

export function AddReceptionistWizardModal({ open, onOpenChange, defaultCalendarId, redirectToDetailOnSuccess = true }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successState, setSuccessState] = useState<{ id: string; phoneNumber?: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<ReceptionistWizardFormData>({
    resolver: zodResolver(receptionistWizardSchema),
    defaultValues: { ...defaultValues, calendar_id: defaultCalendarId },
    mode: "onChange",
  });

  const { watch, setValue, trigger } = form;
  useWizardStorageRestore(open, defaultCalendarId, defaultValues, setStep, form.setValue);
  useWizardStoragePersist(open, step, watch());
  const onSubmit = useWizardSubmit(defaultCalendarId, defaultValues, form, setLoading, setSubmitError, setSuccessState);

  const goNext = useCallback(async () => {
    if (step === 1 && (await trigger(["name", "country", "calendar_id"]))) setStep(2);
    else if (step === 2 && (await trigger(["phone_strategy", "area_code", "own_phone", "provider_sid"]))) setStep(3);
    else if (step === 3 && (await trigger(["system_prompt"]))) setStep(4);
    else if (step === 4 || step === 5) setStep(step + 1);
  }, [step, trigger]);

  const handleViewReceptionist = () => {
    const id = successState?.id; setSuccessState(null); setStep(1); onOpenChange(false);
    if (id && redirectToDetailOnSuccess) router.push(`/receptionists/${id}?created=1`);
  };
  const handleSuccessDismiss = () => { setSuccessState(null); setStep(1); onOpenChange(false); };
  const handleCopyNumber = async () => {
    if (!successState?.phoneNumber) return;
    try { await navigator.clipboard.writeText(successState.phoneNumber); setCopied(true); toast.success("Copied"); setTimeout(() => setCopied(false), 2000); }
    catch { toast.error("Could not copy"); }
  };
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && successState) { setSuccessState(null); setStep(1); }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showClose className="max-w-xl max-h-[90vh] overflow-y-auto mx-4 sm:mx-0 p-4 sm:p-6" aria-describedby={successState ? undefined : "wizard-description"}>
        {successState ? (
          <SuccessStep successState={successState} copied={copied} onCopy={handleCopyNumber} onViewReceptionist={handleViewReceptionist} onDismiss={handleSuccessDismiss} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add Receptionist</DialogTitle>
              <DialogDescription id="wizard-description">Create your AI receptionist in a few steps. Progress is saved.</DialogDescription>
            </DialogHeader>
            <WizardStepper step={step} setStep={setStep} />
            <div className="space-y-4 py-2 min-h-[2rem]" role="region" aria-labelledby="step-indicator">
              {step === 1 && <BasicsStep register={form.register} errors={form.formState.errors} />}
              {step === 2 && <PhoneStep register={form.register} watch={watch} errors={form.formState.errors} />}
              {step === 3 && <InstructionsStep register={form.register} errors={form.formState.errors} onUseDefault={() => setValue("system_prompt", DEFAULT_SYSTEM_PROMPT)} />}
              {step === 4 && <BusinessStep register={form.register} getValues={form.getValues} setValue={form.setValue} />}
              {step === 5 && <AdvancedStep register={form.register} />}
              {step === 6 && <ReviewStep watch={watch} setValue={form.setValue} errors={form.formState.errors} submitError={submitError} />}
            </div>
            <div className="flex flex-wrap justify-between gap-3 pt-4 border-t">
              <div>{step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)} disabled={loading} className="min-h-[2.75rem]">Back</Button>}</div>
              <div className="flex gap-2">
                {(step === 4 || step === 5) && <Button variant="ghost" onClick={() => setStep(step + 1)} className="min-h-[2.5rem] min-w-[2.5rem] sm:min-w-0">Skip</Button>}
                {step < 6 ? <Button onClick={goNext} disabled={loading} className="min-h-[2.75rem]">Next</Button> : <Button onClick={onSubmit} disabled={loading || !watch("consent")} className="min-h-[2.75rem]">{loading ? "Creating…" : "Create"}</Button>}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
