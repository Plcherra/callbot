"use client";

import { Button } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import type { ReceptionistWizardFormData } from "@/app/components/receptionists/wizard/schemas";
import { DEFAULT_SYSTEM_PROMPT } from "@/app/components/receptionists/wizard/schemas";

type Props = {
  register: UseFormRegister<ReceptionistWizardFormData>;
  errors: FieldErrors<ReceptionistWizardFormData>;
  onUseDefault: () => void;
};

export function InstructionsStep({ register, errors, onUseDefault }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">Core instructions for your receptionist</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onUseDefault}>
          Use default prompt
        </Button>
      </div>
      <Textarea
        placeholder={DEFAULT_SYSTEM_PROMPT}
        rows={8}
        {...register("system_prompt")}
        className={errors.system_prompt ? "border-destructive" : ""}
      />
      {errors.system_prompt && (
        <p className="text-sm text-destructive">{errors.system_prompt.message}</p>
      )}
    </div>
  );
}
