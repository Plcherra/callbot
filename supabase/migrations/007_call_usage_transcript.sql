-- Add transcript to call_usage for Vapi end-of-call artifact
ALTER TABLE public.call_usage
  ADD COLUMN IF NOT EXISTS transcript TEXT;
