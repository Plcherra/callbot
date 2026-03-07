/** Wizard payload from AddReceptionistWizardModal */
export type CreateReceptionistWizardData = {
  name: string;
  country: string;
  calendar_id: string;
  phone_strategy: "new" | "own";
  area_code?: string;
  own_phone?: string;
  provider_sid?: string;
  system_prompt: string;
  staff?: Array<{ name: string; description: string }>;
  promotions?: string;
  business_hours?: string;
  voice_personality?: string;
  fallback_behavior?: string;
  max_call_duration_minutes?: number;
};

/** Legacy payload from AddReceptionistForm */
export type CreateReceptionistLegacyData = {
  name: string;
  phone_number: string;
  calendar_id: string;
  country: string;
};

export type CreateReceptionistData =
  | CreateReceptionistWizardData
  | CreateReceptionistLegacyData;

export function isWizardData(
  data: CreateReceptionistData
): data is CreateReceptionistWizardData {
  return "phone_strategy" in data && data.phone_strategy !== undefined;
}
