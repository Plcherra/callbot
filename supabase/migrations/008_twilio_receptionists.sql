-- Add Twilio phone number fields for self-hosted voice AI
ALTER TABLE public.receptionists
  ADD COLUMN IF NOT EXISTS twilio_phone_number_sid TEXT,
  ADD COLUMN IF NOT EXISTS twilio_phone_number TEXT;

CREATE INDEX IF NOT EXISTS receptionists_twilio_phone_number_idx
  ON public.receptionists(twilio_phone_number)
  WHERE twilio_phone_number IS NOT NULL;
