"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import type { UseFormRegister, UseFormGetValues, UseFormSetValue } from "react-hook-form";
import type { ReceptionistWizardFormData } from "@/app/components/receptionists/wizard/schemas";

type Props = {
  register: UseFormRegister<ReceptionistWizardFormData>;
  getValues: UseFormGetValues<ReceptionistWizardFormData>;
  setValue: UseFormSetValue<ReceptionistWizardFormData>;
};

export function BusinessStep({ register, getValues, setValue }: Props) {
  const addStaff = () => {
    setValue("staff", [...(getValues("staff") || []), { name: "", description: "" }]);
  };
  const removeStaff = (index: number) => {
    const staff = getValues("staff") || [];
    setValue("staff", staff.filter((_, i) => i !== index));
  };
  return (
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
        {(getValues("staff") || []).map((_, i) => (
          <div key={i} className="flex gap-2 items-start">
            <Input placeholder="Name" {...register(`staff.${i}.name`)} className="flex-1" />
            <Input placeholder="Role or specialty" {...register(`staff.${i}.description`)} className="flex-1" />
            <Button type="button" variant="ghost" size="icon" onClick={() => removeStaff(i)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Current promotions</label>
        <Textarea placeholder="e.g. 20% off first visit with code WELCOME20" rows={2} {...register("promotions")} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Business hours</label>
        <Input placeholder="e.g. Mon–Fri 9am–6pm, Sat 10am–4pm" {...register("business_hours")} />
      </div>
    </div>
  );
}
