-- Index for receptionist lookup by inbound_phone_number (bring-your-own numbers)
-- Used by Twilio voice and status webhooks
CREATE INDEX IF NOT EXISTS receptionists_inbound_phone_number_idx
  ON public.receptionists(inbound_phone_number)
  WHERE inbound_phone_number IS NOT NULL;
