-- Persist recording consent played on call_logs so CDR can read it when inserting call_usage.
-- Set to true only when the consent phrase is actually sent in the voice pipeline (default false).
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS recording_consent_played BOOLEAN NOT NULL DEFAULT false;
