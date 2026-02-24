-- Drop Vapi columns (Twilio-only as of 2025-02-24)
-- Safe to run if no data uses these columns

-- receptionists
ALTER TABLE public.receptionists
  DROP COLUMN IF EXISTS vapi_assistant_id,
  DROP COLUMN IF EXISTS vapi_phone_number_id;

-- users (from 001_initial_schema)
ALTER TABLE public.users DROP COLUMN IF EXISTS vapi_assistant_id;

-- call_usage: drop vapi_call_id (Twilio uses call_sid; unique index exists from 009)
DROP INDEX IF EXISTS call_usage_vapi_call_id_idx;
ALTER TABLE public.call_usage DROP COLUMN IF EXISTS vapi_call_id;
