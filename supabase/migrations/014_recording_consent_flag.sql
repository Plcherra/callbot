-- Add recording consent flag to call_usage.
-- Set true when greeting (which includes consent notice) is played.

ALTER TABLE public.call_usage
  ADD COLUMN IF NOT EXISTS recording_consent_played BOOLEAN DEFAULT true;
