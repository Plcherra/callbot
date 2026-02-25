import { z } from "zod";

/** E.164 regex: +1XXXXXXXXXX for US/CA, or generic international */
const E164_REGEX = /^\+[1-9]\d{6,14}$/;

export const AREA_CODES = [
  { value: "212", label: "212 (New York)" },
  { value: "310", label: "310 (LA)" },
  { value: "415", label: "415 (San Francisco)" },
  { value: "617", label: "617 (Boston)" },
  { value: "646", label: "646 (New York)" },
  { value: "202", label: "202 (DC)" },
  { value: "305", label: "305 (Miami)" },
  { value: "702", label: "702 (Las Vegas)" },
  { value: "other", label: "Other" },
] as const;

export const COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "UK", label: "United Kingdom" },
  { value: "Other", label: "Other" },
] as const;

export const VOICE_PERSONALITIES = [
  { value: "friendly", label: "Friendly & Warm" },
  { value: "professional", label: "Professional & Calm" },
  { value: "energetic", label: "Energetic" },
  { value: "calm", label: "Calm & Soothing" },
] as const;

export const FALLBACK_BEHAVIORS = [
  { value: "voicemail", label: "Take voicemail" },
  { value: "transfer", label: "Transfer to human" },
] as const;

export const DEFAULT_SYSTEM_PROMPT =
  "You are a friendly, professional receptionist for a [business or personal context, e.g. salon, consulting, personal]. Answer calls politely, book appointments into Google Calendar, confirm details, and be helpful. Never be pushy.";

const staffItemSchema = z.object({
  name: z.string(),
  description: z.string(),
});

const receptionistWizardBaseSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  country: z.enum(["US", "CA", "UK", "Other"]),
  calendar_id: z
    .string()
    .min(1, "Calendar ID is required")
    .refine(
      (val) => val === "primary" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
      "Enter a valid email (e.g. echodesk2@gmail.com) or 'primary'"
    ),

  phone_strategy: z.enum(["new", "own"]),
  area_code: z.string().optional(),
  own_phone: z.string().optional(),
  provider_sid: z.string().optional(),

  system_prompt: z.string().min(1, "System prompt is required"),

  staff: z.array(staffItemSchema),
  promotions: z.string().optional(),
  business_hours: z.string().optional(),

  voice_personality: z
    .enum(["friendly", "professional", "energetic", "calm"])
    .optional(),
  fallback_behavior: z.enum(["voicemail", "transfer"]).optional(),
  max_call_duration_minutes: z
    .number()
    .min(1)
    .max(60)
    .optional()
    .nullable(),

  consent: z.boolean().refine((v) => v === true, "Consent is required"),
});

/** Schema for the full wizard form - used for final submit validation */
export const receptionistWizardSchema = receptionistWizardBaseSchema.superRefine(
  (data, ctx) => {
    if (data.phone_strategy === "new") {
      if (!data.area_code) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please select a preferred area code",
          path: ["area_code"],
        });
      }
    } else if (data.phone_strategy === "own") {
      if (!data.own_phone?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Phone number is required",
          path: ["own_phone"],
        });
      } else if (!E164_REGEX.test(data.own_phone.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter phone in E.164 format (e.g. +15551234567)",
          path: ["own_phone"],
        });
      }
    }
  }
);

export type ReceptionistWizardFormData = z.infer<typeof receptionistWizardSchema>;

/** Per-step validation schemas for react-hook-form */
export const step1Schema = receptionistWizardBaseSchema.pick({
  name: true,
  country: true,
  calendar_id: true,
});

export const step2Schema = z
  .object({
    phone_strategy: z.enum(["new", "own"]),
    area_code: z.string().optional(),
    own_phone: z.string().optional(),
    provider_sid: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.phone_strategy === "new") {
      if (!data.area_code) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please select a preferred area code",
          path: ["area_code"],
        });
      }
    } else if (data.phone_strategy === "own") {
      if (!data.own_phone?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Phone number is required",
          path: ["own_phone"],
        });
      } else if (!E164_REGEX.test(data.own_phone.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter phone in E.164 format (e.g. +15551234567)",
          path: ["own_phone"],
        });
      }
    }
  });

export const step3Schema = receptionistWizardBaseSchema.pick({
  system_prompt: true,
});
