-- Optional Telnyx downstream detail for delivery debugging (webhook payload excerpts).

ALTER TABLE public.sms_messages
  ADD COLUMN IF NOT EXISTS provider_status_detail TEXT,
  ADD COLUMN IF NOT EXISTS provider_errors JSONB;

COMMENT ON COLUMN public.sms_messages.provider_status_detail IS 'Carrier/Telnyx status text when available.';
COMMENT ON COLUMN public.sms_messages.provider_errors IS 'Telnyx errors array/object from message.finalized when present.';
