"use client";

import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import type { ReceptionistWizardFormData } from "@/app/components/receptionists/wizard/schemas";
import { COUNTRIES } from "@/app/components/receptionists/wizard/schemas";

type Props = {
  register: UseFormRegister<ReceptionistWizardFormData>;
  errors: FieldErrors<ReceptionistWizardFormData>;
};

export function BasicsStep({ register, errors }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Receptionist name</label>
        <Input
          placeholder="e.g. Eve, Alex, My AI Receptionist"
          {...register("name")}
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
          {...register("country")}
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
          {...register("calendar_id")}
          className={errors.calendar_id ? "border-destructive" : ""}
        />
        {errors.calendar_id && (
          <p className="text-sm text-destructive">
            {errors.calendar_id.message}
          </p>
        )}
      </div>
    </div>
  );
}
