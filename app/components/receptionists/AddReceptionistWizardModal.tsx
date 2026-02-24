"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Plus, Trash2, Phone, Smartphone, Copy, Check, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Select } from "@/app/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/components/ui/tooltip";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Card, CardContent } from "@/app/components/ui/card";
import { createReceptionist } from "@/app/actions/createReceptionist";
import {
  receptionistWizardSchema,
  type ReceptionistWizardFormData,
  DEFAULT_SYSTEM_PROMPT,
  AREA_CODES,
  COUNTRIES,
  VOICE_PERSONALITIES,
  FALLBACK_BEHAVIORS,
} from "@/app/components/receptionists/wizard/schemas";

const CONSENT_GUIDE_URL = "/call-recording-laws";
const WIZARD_STORAGE_KEY = "addReceptionistWizard";

const WIZARD_STEPS = [
  { id: 1, label: "Basics" },
  { id: 2, label: "Phone" },
  { id: 3, label: "Instructions" },
  { id: 4, label: "Business" },
  { id: 5, label: "Advanced" },
  { id: 6, label: "Review" },
] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCalendarId: string;
  redirectToDetailOnSuccess?: boolean;
};

const defaultValues: ReceptionistWizardFormData = {
  name: "",
  country: "US",
  calendar_id: "",
  phone_strategy: "new",
  area_code: "212",
  own_phone: "",
  provider_sid: "",
  system_prompt: DEFAULT_SYSTEM_PROMPT,
  staff: [],
  promotions: "",
  business_hours: "",
  voice_personality: "friendly",
  fallback_behavior: "voicemail",
  max_call_duration_minutes: null,
  consent: false,
};

export function AddReceptionistWizardModal({
  open,
  onOpenChange,
  defaultCalendarId,
  redirectToDetailOnSuccess = true,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successState, setSuccessState] = useState<{
    id: string;
    phoneNumber?: string;
    name: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<ReceptionistWizardFormData>({
    resolver: zodResolver(receptionistWizardSchema),
    defaultValues: {
      ...defaultValues,
      calendar_id: defaultCalendarId,
    },
    mode: "onChange",
  });

  const { watch, setValue, trigger, formState: { errors } } = form;

  // Restore from localStorage on open
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(WIZARD_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          step?: number;
          formData?: Partial<ReceptionistWizardFormData>;
        };
        if (parsed.step && parsed.step >= 1 && parsed.step <= 6) {
          setStep(parsed.step);
        }
        if (parsed.formData && typeof parsed.formData === "object") {
          Object.entries(parsed.formData).forEach(([key, value]) => {
            if (value !== undefined && key in defaultValues) {
              form.setValue(
                key as keyof ReceptionistWizardFormData,
                value as ReceptionistWizardFormData[keyof ReceptionistWizardFormData]
              );
            }
          });
          if (!parsed.formData.calendar_id && defaultCalendarId) {
            form.setValue("calendar_id", defaultCalendarId);
          }
          if (!Array.isArray(parsed.formData.staff)) {
            form.setValue("staff", []);
          }
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [open, defaultCalendarId, form.setValue]);

  // Persist to localStorage on change
  const formValues = watch();
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    try {
      localStorage.setItem(
        WIZARD_STORAGE_KEY,
        JSON.stringify({ step, formData: formValues })
      );
    } catch {
      // ignore
    }
  }, [open, step, formValues]);

  const goNext = useCallback(async () => {
    if (step === 1) {
      const ok = await trigger(["name", "country", "calendar_id"]);
      if (ok) setStep(2);
    } else if (step === 2) {
      const ok = await trigger(["phone_strategy", "area_code", "own_phone", "provider_sid"]);
      if (ok) setStep(3);
    } else if (step === 3) {
      const ok = await trigger(["system_prompt"]);
      if (ok) setStep(4);
    } else if (step === 4 || step === 5) {
      setStep(step + 1);
    } else if (step === 6) {
      // handled by submit
    }
  }, [step, trigger]);

  const goBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSkip = () => {
    if (step === 4 || step === 5) {
      setStep(step + 1);
    }
  };

  const addStaff = () => {
    form.setValue("staff", [...(form.getValues("staff") || []), { name: "", description: "" }]);
  };

  const removeStaff = (index: number) => {
    const staff = form.getValues("staff") || [];
    form.setValue(
      "staff",
      staff.filter((_, i) => i !== index)
    );
  };

  const onSubmit = form.handleSubmit(async (data) => {
    if (!data.consent) {
      form.setError("consent", { message: "Consent is required to create a receptionist." });
      return;
    }
    setSubmitError(null);
    setLoading(true);

    const areaCode =
      data.phone_strategy === "new"
        ? data.area_code === "other"
          ? "212"
          : data.area_code
        : undefined;
    const phone =
      data.phone_strategy === "own" ? data.own_phone?.trim() : undefined;

    const result = await createReceptionist({
      name: data.name,
      country: data.country,
      calendar_id: data.calendar_id,
      phone_strategy: data.phone_strategy,
      area_code: areaCode,
      own_phone: phone,
      provider_sid: data.provider_sid?.trim() || undefined,
      system_prompt: data.system_prompt,
      staff: data.staff?.filter((s) => s.name.trim()) || [],
      promotions: data.promotions?.trim() || undefined,
      business_hours: data.business_hours?.trim() || undefined,
      voice_personality: data.voice_personality,
      fallback_behavior: data.fallback_behavior,
      max_call_duration_minutes: data.max_call_duration_minutes ?? undefined,
    });

    setLoading(false);
    if (result.success) {
      try {
        localStorage.removeItem(WIZARD_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      form.reset({ ...defaultValues, calendar_id: defaultCalendarId });
      setSuccessState({
        id: result.id ?? "",
        phoneNumber: result.phoneNumber,
        name: data.name,
      });
      toast.success("Receptionist created successfully!");
      router.refresh();
    } else {
      setSubmitError(result.error);
    }
  });

  const handleViewReceptionist = () => {
    const id = successState?.id;
    setSuccessState(null);
    setStep(1);
    onOpenChange(false);
    if (id && redirectToDetailOnSuccess) {
      router.push(`/receptionists/${id}?created=1`);
    }
  };

  const handleSuccessDismiss = () => {
    setSuccessState(null);
    setStep(1);
    onOpenChange(false);
  };

  const handleCopyNumber = async () => {
    if (!successState?.phoneNumber) return;
    try {
      await navigator.clipboard.writeText(successState.phoneNumber);
      setCopied(true);
      toast.success("Number copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  };

  const useDefaultPrompt = () => {
    form.setValue("system_prompt", DEFAULT_SYSTEM_PROMPT);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && successState) {
      setSuccessState(null);
      setStep(1);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showClose={true}
        className="max-w-xl max-h-[90vh] overflow-y-auto mx-4 sm:mx-0 p-4 sm:p-6"
        aria-describedby={successState ? undefined : "wizard-description"}
      >
        {/* Success state */}
        {successState ? (
          <div className="space-y-6 py-4">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
                <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-lg font-semibold">Receptionist created!</h2>
              <p className="text-sm text-muted-foreground mt-1">
                &quot;{successState.name}&quot; is ready to take calls.
              </p>
            </div>
            {successState.phoneNumber && (
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <p className="text-sm font-medium">Your new number</p>
                  <p className="text-lg font-mono tracking-wide">
                    {successState.phoneNumber}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Button asChild size="sm">
                      <a href={`tel:${successState.phoneNumber}`}>
                        <PhoneCall className="mr-2 h-4 w-4" />
                        Call now
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyNumber}
                    >
                      {copied ? (
                        <Check className="mr-2 h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="mr-2 h-4 w-4" />
                      )}
                      {copied ? "Copied!" : "Copy number"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleSuccessDismiss}>
                Done
              </Button>
              {successState.id && (
                <Button onClick={handleViewReceptionist}>
                  View receptionist
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
        <DialogHeader>
          <DialogTitle>Add Receptionist</DialogTitle>
          <DialogDescription id="wizard-description">
            Create your AI receptionist in a few simple steps. Progress is saved if you close this window.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper with labels */}
        <nav
          aria-label="Add receptionist wizard progress"
          className="py-4"
        >
          <div className="flex items-center justify-between gap-0.5 text-center">
            {WIZARD_STEPS.map((s, i) => (
              <div key={s.id} className="flex flex-1 flex-col items-center">
                <div className="flex flex-1 w-full items-center">
                  <div
                    className={`mx-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                      step > s.id
                        ? "bg-green-600 text-white dark:bg-green-500"
                        : step === s.id
                          ? "border-2 border-primary bg-primary/10 text-primary"
                          : "border border-muted-foreground/40 bg-muted/50 text-muted-foreground"
                    }`}
                    aria-label={`Step ${s.id} of 6: ${s.label}${step > s.id ? ", completed" : step === s.id ? ", current" : ""}`}
                  >
                    {step > s.id ? "✓" : s.id}
                  </div>
                  {i < WIZARD_STEPS.length - 1 && (
                    <div className="h-0.5 flex-1 bg-muted min-w-2" aria-hidden="true" />
                  )}
                </div>
                <span className="mt-1.5 text-[10px] font-medium text-muted-foreground truncate max-w-full">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-4" id="step-indicator">
            Step {step} of 6: {WIZARD_STEPS[step - 1]?.label}
          </p>
        </nav>

        {/* Step content */}
        <div
          className="space-y-4 py-2 min-h-[2rem]"
          role="region"
          aria-labelledby="step-indicator"
        >
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Receptionist name</label>
                <Input
                  placeholder="e.g. Eve, Alex, My AI Receptionist"
                  {...form.register("name")}
                  className={`min-h-[2.75rem] sm:min-h-0 ${errors.name ? "border-destructive" : ""}`}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Country</label>
                <Select
                  options={COUNTRIES.map((c) => ({ value: c.value, label: c.label }))}
                  {...form.register("country")}
                  className={errors.country ? "border-destructive" : ""}
                />
                <p className="text-xs text-muted-foreground">
                  Affects voice and number provisioning.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Calendar ID</label>
                <Input
                  placeholder="primary or email@example.com"
                  {...form.register("calendar_id")}
                  className={errors.calendar_id ? "border-destructive" : ""}
                />
                {errors.calendar_id && (
                  <p className="text-sm text-destructive">
                    {errors.calendar_id.message}
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm font-medium">
                How do you want to connect this receptionist to phone calls?
              </p>

              <div className="grid gap-3">
                <label
                  className={`flex cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                    form.watch("phone_strategy") === "new"
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/50"
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    {...form.register("phone_strategy")}
                    value="new"
                  />
                  <Phone className="mr-3 h-5 w-5 shrink-0 text-muted-foreground" />
                  <div>
                    <span className="font-medium">Give me a new phone number</span>
                    <p className="mt-1 text-sm text-muted-foreground">
                      We&apos;ll provision a fresh US number through Twilio (~$1–2/month).
                    </p>
                    {form.watch("phone_strategy") === "new" && (
                      <div className="mt-3">
                        <label className="text-xs font-medium">Preferred area code</label>
                        <Select
                          options={AREA_CODES.map((a) => ({ value: a.value, label: a.label }))}
                          {...form.register("area_code")}
                          className="mt-1"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          Most popular choice. Instant setup. Caller ID shows this number.
                        </p>
                      </div>
                    )}
                  </div>
                </label>

                <label
                  className={`flex cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                    form.watch("phone_strategy") === "own"
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/50"
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    {...form.register("phone_strategy")}
                    value="own"
                  />
                  <Smartphone className="mr-3 h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="flex-1">
                    <span className="font-medium">Bring my own number</span>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Use a number you already own (Twilio, Telnyx, Verizon, AT&T, etc.).
                    </p>
                    {form.watch("phone_strategy") === "own" && (
                      <div className="mt-3 space-y-2">
                        <div>
                          <label className="text-xs font-medium">Phone number (E.164)</label>
                          <Input
                            placeholder="+15551234567"
                            {...form.register("own_phone")}
                            className="mt-1"
                          />
                          {errors.own_phone && (
                            <p className="text-sm text-destructive">{errors.own_phone.message}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-xs font-medium">
                            Provider Phone SID (optional, for Twilio/Telnyx)
                          </label>
                          <Input
                            placeholder="PN..."
                            {...form.register("provider_sid")}
                            className="mt-1"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          For carrier numbers, you&apos;ll need to set call forwarding after creation.
                        </p>
                      </div>
                    )}
                  </div>
                </label>
              </div>
              {errors.area_code && form.watch("phone_strategy") === "new" && (
                <p className="text-sm text-destructive">{errors.area_code.message}</p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm font-medium">Core instructions for your receptionist</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={useDefaultPrompt}>
                  Use default prompt
                </Button>
              </div>
              <Textarea
                placeholder={DEFAULT_SYSTEM_PROMPT}
                rows={8}
                {...form.register("system_prompt")}
                className={errors.system_prompt ? "border-destructive" : ""}
              />
              {errors.system_prompt && (
                <p className="text-sm text-destructive">{errors.system_prompt.message}</p>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">Business details (optional)</p>
                <span className="text-xs text-muted-foreground">You can skip this step</span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Staff members</label>
                  <Button type="button" variant="ghost" size="sm" onClick={addStaff}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
                {(form.watch("staff") || []).map((_, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <Input
                      placeholder="Name"
                      {...form.register(`staff.${i}.name`)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Role or specialty"
                      {...form.register(`staff.${i}.description`)}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeStaff(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Current promotions</label>
                <Textarea
                  placeholder="e.g. 20% off first visit with code WELCOME20"
                  rows={2}
                  {...form.register("promotions")}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Business hours</label>
                <Input
                  placeholder="e.g. Mon–Fri 9am–6pm, Sat 10am–4pm"
                  {...form.register("business_hours")}
                />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">Advanced settings (optional)</p>
                <span className="text-xs text-muted-foreground">You can skip this step</span>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Voice personality</label>
                <Select
                  options={VOICE_PERSONALITIES.map((v) => ({ value: v.value, label: v.label }))}
                  {...form.register("voice_personality")}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Fallback if AI can&apos;t help</label>
                <Select
                  options={FALLBACK_BEHAVIORS.map((f) => ({ value: f.value, label: f.label }))}
                  {...form.register("fallback_behavior")}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Max call duration (minutes)</label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  placeholder="e.g. 15"
                  {...form.register("max_call_duration_minutes", {
                    setValueAs: (v) => (v === "" ? null : parseInt(v, 10) || null),
                  })}
                />
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <p className="text-sm font-medium">Review & create</p>
              <div className="grid gap-3">
                <Card>
                  <CardContent className="pt-4 space-y-2">
                    <p><span className="text-muted-foreground">Name:</span> {form.watch("name") || "—"}</p>
                    <p><span className="text-muted-foreground">Country:</span> {form.watch("country")}</p>
                    <p><span className="text-muted-foreground">Calendar:</span> {form.watch("calendar_id") || "—"}</p>
                    <p>
                      <span className="text-muted-foreground">Phone:</span>{" "}
                      {form.watch("phone_strategy") === "new"
                        ? `New number (${form.watch("area_code") || "—"})`
                        : form.watch("own_phone") || "—"}
                    </p>
                    <p className="text-muted-foreground text-xs mt-2">
                      Prompt: {(form.watch("system_prompt") || "").slice(0, 80)}...
                    </p>
                  </CardContent>
                </Card>

                <div className="flex items-start gap-2 rounded-lg border p-4">
                  <Checkbox
                    id="consent"
                    checked={form.watch("consent")}
                    onCheckedChange={(checked) =>
                      form.setValue("consent", checked === true)
                    }
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <label
                      htmlFor="consent"
                      className="text-sm font-medium leading-tight cursor-pointer flex items-center gap-1.5"
                    >
                      I confirm that I have obtained all necessary consents for call recording
                      and AI interaction in my jurisdiction.
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-muted-foreground hover:text-foreground cursor-help">
                            <Info className="h-4 w-4" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="mb-2">
                            In many U.S. states, all-party consent is required for recording.
                          </p>
                          <Link
                            href={CONSENT_GUIDE_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline"
                          >
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
          )}
        </div>

        {/* Footer buttons - touch-friendly on mobile */}
        <div className="flex flex-wrap justify-between gap-3 pt-4 border-t">
          <div>
            {step > 1 && step < 6 && (
              <Button variant="outline" onClick={goBack} disabled={loading} className="min-h-[2.75rem]">
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {(step === 4 || step === 5) && (
              <Button variant="ghost" onClick={handleSkip} className="min-h-[2.5rem] min-w-[2.5rem] sm:min-w-0">
                Skip this step
              </Button>
            )}
            {step < 6 ? (
              <Button onClick={goNext} disabled={loading} className="min-h-[2.75rem]">
                Next
              </Button>
            ) : (
              <Button
                onClick={onSubmit}
                disabled={loading || !form.watch("consent")}
                className="min-h-[2.75rem]"
              >
                {loading ? "Creating…" : "Create Receptionist"}
              </Button>
            )}
          </div>
        </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
