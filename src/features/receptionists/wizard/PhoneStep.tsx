"use client";

import { Phone, Smartphone } from "lucide-react";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";
import type { UseFormRegister, UseFormWatch, FieldErrors } from "react-hook-form";
import type { ReceptionistWizardFormData } from "@/app/components/receptionists/wizard/schemas";
import { AREA_CODES } from "@/app/components/receptionists/wizard/schemas";

type Props = {
  register: UseFormRegister<ReceptionistWizardFormData>;
  watch: UseFormWatch<ReceptionistWizardFormData>;
  errors: FieldErrors<ReceptionistWizardFormData>;
};

export function PhoneStep({ register, watch, errors }: Props) {
  const strategy = watch("phone_strategy");
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">
        How do you want to connect this receptionist to phone calls?
      </p>
      <div className="grid gap-3">
        <label
          className={`flex cursor-pointer rounded-lg border-2 p-4 transition-colors ${
            strategy === "new"
              ? "border-primary bg-primary/5"
              : "border-muted hover:border-muted-foreground/50"
          }`}
        >
          <input type="radio" className="sr-only" {...register("phone_strategy")} value="new" />
          <Phone className="mr-3 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <span className="font-medium">Give me a new phone number</span>
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;ll provision a fresh US number through Telnyx (~$1–2/month).
            </p>
            {strategy === "new" && (
              <div className="mt-3">
                <label className="text-xs font-medium">Preferred area code</label>
                <Select
                  options={AREA_CODES.map((a) => ({ value: a.value, label: a.label }))}
                  {...register("area_code")}
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
            strategy === "own"
              ? "border-primary bg-primary/5"
              : "border-muted hover:border-muted-foreground/50"
          }`}
        >
          <input type="radio" className="sr-only" {...register("phone_strategy")} value="own" />
          <Smartphone className="mr-3 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="flex-1">
            <span className="font-medium">Bring my own number</span>
            <p className="mt-1 text-sm text-muted-foreground">
              Use a number you already own (Telnyx, Verizon, AT&T, etc.).
            </p>
            {strategy === "own" && (
              <div className="mt-3 space-y-2">
                <div>
                  <label className="text-xs font-medium">Phone number (E.164)</label>
                  <Input placeholder="+15551234567" {...register("own_phone")} className="mt-1" />
                  {errors.own_phone && (
                    <p className="text-sm text-destructive">{errors.own_phone.message}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium">Telnyx Phone Number ID (optional)</label>
                  <Input placeholder="PN..." {...register("provider_sid")} className="mt-1" />
                </div>
                <p className="text-xs text-muted-foreground">
                  For carrier numbers, you&apos;ll need to set call forwarding after creation.
                </p>
              </div>
            )}
          </div>
        </label>
      </div>
      {errors.area_code && strategy === "new" && (
        <p className="text-sm text-destructive">{errors.area_code.message}</p>
      )}
    </div>
  );
}
