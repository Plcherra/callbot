-- Business phone setup can exist before any Telnyx provisioning attempt.
-- Use not_started for clean first-time setup, and reserve failed for real provider failures.

ALTER TABLE public.business_phone_numbers
  DROP CONSTRAINT IF EXISTS business_phone_numbers_status_check;

ALTER TABLE public.business_phone_numbers
  ALTER COLUMN status SET DEFAULT 'not_started';

ALTER TABLE public.business_phone_numbers
  ADD CONSTRAINT business_phone_numbers_status_check
  CHECK (status IN ('not_started', 'provisioning', 'active', 'failed'));

UPDATE public.business_phone_numbers
SET status = 'not_started',
    updated_at = NOW()
WHERE status = 'provisioning'
  AND phone_number_e164 IS NULL
  AND telnyx_number_id IS NULL;
