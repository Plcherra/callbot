-- SMS delivery tracking: store Telnyx message IDs for webhook status updates.
-- When message.finalized webhook fires, we update status (delivered/failed).

CREATE TABLE IF NOT EXISTS public.sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telnyx_message_id TEXT NOT NULL,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  to_number TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS sms_messages_telnyx_id_idx
  ON public.sms_messages(telnyx_message_id);
CREATE INDEX IF NOT EXISTS sms_messages_appointment_id_idx
  ON public.sms_messages(appointment_id);

COMMENT ON TABLE public.sms_messages IS 'SMS delivery tracking; updated by Telnyx message.finalized webhook.';
COMMENT ON COLUMN public.sms_messages.status IS 'sent (from API) | delivered | delivery_failed | delivery_unconfirmed | sending_failed';
