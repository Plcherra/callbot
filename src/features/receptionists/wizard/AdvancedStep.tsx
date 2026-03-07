"use client";

import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import type { UseFormRegister } from "react-hook-form";
import type { ReceptionistWizardFormData } from "@/app/components/receptionists/wizard/schemas";
import { VOICE_PERSONALITIES, FALLBACK_BEHAVIORS } from "@/app/components/receptionists/wizard/schemas";

type Props = {
  register: UseFormRegister<ReceptionistWizardFormData>;
};

export function AdvancedStep({ register }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Advanced settings (optional)</p>
        <span className="text-xs text-muted-foreground">You can skip this step</span>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Voice personality</label>
        <Select
          options={VOICE_PERSONALITIES.map((v) => ({ value: v.value, label: v.label }))}
          {...register("voice_personality")}
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Fallback if AI can&apos;t help</label>
        <Select
          options={FALLBACK_BEHAVIORS.map((f) => ({ value: f.value, label: f.label }))}
          {...register("fallback_behavior")}
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Max call duration (minutes)</label>
        <Input
          type="number"
          min={1}
          max={60}
          placeholder="e.g. 15"
          {...register("max_call_duration_minutes", {
            setValueAs: (v) => (v === "" ? null : parseInt(v, 10) || null),
          })}
        />
      </div>
    </div>
  );
}
