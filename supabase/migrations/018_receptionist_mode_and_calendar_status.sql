-- Receptionist mode (personal vs business) and calendar status helpers
-- - Adds mode column to receptionists with safe default
-- - Backfills existing rows to 'personal' for backward compatibility

ALTER TABLE public.receptionists
  ADD COLUMN IF NOT EXISTS mode TEXT;

-- Backfill NULL mode to 'personal' so existing assistants keep working
UPDATE public.receptionists
SET mode = 'personal'
WHERE mode IS NULL;

ALTER TABLE public.receptionists
  ALTER COLUMN mode SET NOT NULL,
  ALTER COLUMN mode SET DEFAULT 'personal',
  ADD CONSTRAINT receptionists_mode_check
    CHECK (mode IN ('personal', 'business'));

