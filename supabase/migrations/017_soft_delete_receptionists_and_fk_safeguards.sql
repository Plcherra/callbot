-- Soft delete for receptionists and safe FKs for call history/usage
-- - Add deleted_at and active flag to receptionists
-- - Relax NOT NULL on call_logs.receptionist_id
-- - Change call_logs.receptionist_id FK to ON DELETE SET NULL
-- - Relax NOT NULL on call_usage.receptionist_id
-- - Change call_usage.receptionist_id FK to ON DELETE SET NULL
-- - Ensure call_usage.user_id is populated and used for billing

-- 1) receptionists: soft delete fields
ALTER TABLE public.receptionists
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS active BOOLEAN;

-- Backfill active for existing rows (treat NULL as true)
UPDATE public.receptionists
SET active = TRUE
WHERE active IS NULL;

ALTER TABLE public.receptionists
  ALTER COLUMN active SET NOT NULL,
  ALTER COLUMN active SET DEFAULT TRUE;


-- 2) call_logs.receptionist_id: allow NULL and protect from cascade delete
ALTER TABLE public.call_logs
  ALTER COLUMN receptionist_id DROP NOT NULL;

ALTER TABLE public.call_logs
  DROP CONSTRAINT IF EXISTS call_logs_receptionist_id_fkey;

ALTER TABLE public.call_logs
  ADD CONSTRAINT call_logs_receptionist_id_fkey
  FOREIGN KEY (receptionist_id)
  REFERENCES public.receptionists(id)
  ON DELETE SET NULL;


-- 3) call_usage.receptionist_id: allow NULL and protect from cascade delete
ALTER TABLE public.call_usage
  ALTER COLUMN receptionist_id DROP NOT NULL;

ALTER TABLE public.call_usage
  DROP CONSTRAINT IF EXISTS call_usage_receptionist_id_fkey;

ALTER TABLE public.call_usage
  ADD CONSTRAINT call_usage_receptionist_id_fkey
  FOREIGN KEY (receptionist_id)
  REFERENCES public.receptionists(id)
  ON DELETE SET NULL;


-- 4) Ensure call_usage.user_id is always set going forward
-- For any legacy rows, backfill from receptionists (safe no-op if none)
UPDATE public.call_usage cu
SET user_id = r.user_id
FROM public.receptionists r
WHERE cu.receptionist_id = r.id
  AND cu.user_id IS NULL;

