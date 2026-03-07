import type { CreateReceptionistWizardData } from "./types";

export function buildExtraInstructions(data: CreateReceptionistWizardData): string | undefined {
  const extraParts: string[] = [];
  if (data.system_prompt?.trim()) extraParts.push(data.system_prompt.trim());
  if (data.voice_personality) extraParts.push(`Voice personality: ${data.voice_personality}.`);
  if (data.fallback_behavior) {
    extraParts.push(`Fallback if AI cannot help: ${data.fallback_behavior === "voicemail" ? "take voicemail" : "transfer to human"}.`);
  }
  if (data.max_call_duration_minutes) {
    extraParts.push(`Max call duration: ${data.max_call_duration_minutes} minutes.`);
  }
  if (data.business_hours) extraParts.push(`Business hours: ${data.business_hours}`);
  return extraParts.length > 0 ? extraParts.join("\n\n") : undefined;
}
