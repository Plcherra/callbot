-- Minimal SMS booking conversation state + inbound webhook idempotency.

CREATE TABLE IF NOT EXISTS public.sms_booking_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'idle' CHECK (state IN ('idle', 'pending_confirm')),
  proposed_start_iso TIMESTAMPTZ,
  duration_minutes INT NOT NULL DEFAULT 30,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sms_booking_sessions_rec_customer_unique UNIQUE (receptionist_id, customer_phone)
);

CREATE INDEX IF NOT EXISTS sms_booking_sessions_updated_idx
  ON public.sms_booking_sessions (updated_at);

COMMENT ON TABLE public.sms_booking_sessions IS 'SMS booking: idle vs pending_confirm; one row per receptionist + customer phone.';

CREATE TABLE IF NOT EXISTS public.sms_inbound_events (
  telnyx_event_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.sms_inbound_events IS 'Dedup Telnyx message.received (and similar) webhook deliveries.';
