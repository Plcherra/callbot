import { useEffect } from "react";
import type { UseFormSetValue } from "react-hook-form";
import type { ReceptionistWizardFormData } from "@/app/components/receptionists/wizard/schemas";
import { WIZARD_STORAGE_KEY } from "./constants";

type DefaultValues = ReceptionistWizardFormData;

export function useWizardStorageRestore(
  open: boolean,
  defaultCalendarId: string,
  defaultValues: DefaultValues,
  setStep: (s: number) => void,
  formSetValue: UseFormSetValue<ReceptionistWizardFormData>
) {
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
              formSetValue(
                key as keyof ReceptionistWizardFormData,
                value as ReceptionistWizardFormData[keyof ReceptionistWizardFormData]
              );
            }
          });
          if (!parsed.formData.calendar_id && defaultCalendarId) {
            formSetValue("calendar_id", defaultCalendarId);
          }
          if (!Array.isArray(parsed.formData.staff)) {
            formSetValue("staff", []);
          }
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [open, defaultCalendarId, formSetValue, setStep, defaultValues]);
}

export function useWizardStoragePersist(
  open: boolean,
  step: number,
  formValues: ReceptionistWizardFormData
) {
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
}
