import { useCallback } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createReceptionist } from "@/app/actions/createReceptionist";
import type { ReceptionistWizardFormData } from "@/app/components/receptionists/wizard/schemas";
import { WIZARD_STORAGE_KEY } from "./constants";

type DefaultValues = ReceptionistWizardFormData;

export function useWizardSubmit(
  defaultCalendarId: string,
  defaultValues: DefaultValues,
  form: UseFormReturn<ReceptionistWizardFormData>,
  setLoading: (v: boolean) => void,
  setSubmitError: (v: string | null) => void,
  setSuccessState: (v: { id: string; phoneNumber?: string; name: string } | null) => void
) {
  const router = useRouter();
  return useCallback(
    form.handleSubmit(async (data: ReceptionistWizardFormData) => {
      if (!data.consent) { form.setError("consent", { message: "Consent is required." }); return; }
      setSubmitError(null); setLoading(true);
      const result = await createReceptionist({
        name: data.name, country: data.country, calendar_id: data.calendar_id, phone_strategy: data.phone_strategy,
        area_code: data.phone_strategy === "new" ? (data.area_code === "other" ? "212" : data.area_code) : undefined,
        own_phone: data.phone_strategy === "own" ? data.own_phone?.trim() : undefined,
        provider_sid: data.provider_sid?.trim() || undefined, system_prompt: data.system_prompt,
        staff: data.staff?.filter((s) => s.name.trim()) || [], promotions: data.promotions?.trim() || undefined,
        business_hours: data.business_hours?.trim() || undefined, voice_personality: data.voice_personality,
        fallback_behavior: data.fallback_behavior, max_call_duration_minutes: data.max_call_duration_minutes ?? undefined,
      });
      setLoading(false);
      if (result.success) {
        try { localStorage.removeItem(WIZARD_STORAGE_KEY); } catch { /* ignore */ }
        form.reset({ ...defaultValues, calendar_id: defaultCalendarId });
        setSuccessState({ id: result.id ?? "", phoneNumber: result.phoneNumber, name: data.name });
        toast.success("Receptionist created!"); router.refresh();
      } else {
        setSubmitError((result.error || "Something went wrong.").replace(/<[^>]*>/g, "").trim() || "Could not create.");
      }
    }),
    [defaultCalendarId, defaultValues, form, setLoading, setSubmitError, setSuccessState, router]
  );
}
