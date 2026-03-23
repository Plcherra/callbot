-- Appointment review workflow: status, caller_number, RLS for updates

-- 1) Status: confirmed | needs_review | cancelled | completed
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'needs_review';

-- Backfill: set existing rows without status
UPDATE public.appointments SET status = 'confirmed' WHERE status IS NULL OR status = '';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_status_check') THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_status_check
      CHECK (status IN ('confirmed', 'needs_review', 'cancelled', 'completed'));
  END IF;
END $$;

-- 2) Caller number (E.164 from voice call)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS caller_number TEXT;

COMMENT ON COLUMN public.appointments.caller_number IS 'E.164 caller phone from the booking call.';

-- 3) Optional link to call_logs for transcript (future enhancement)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS call_log_id UUID REFERENCES public.call_logs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.appointments.call_log_id IS 'Link to call_logs for transcript when available.';

-- 4) Confirmation/payment tracking
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS confirmation_message_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_link_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.appointments.confirmation_message_sent_at IS 'When follow-up confirmation SMS was sent.';
COMMENT ON COLUMN public.appointments.payment_link_sent_at IS 'When payment link was sent to caller.';

-- 5) RLS: users can UPDATE their own appointments (confirm, reject, edit)
DROP POLICY IF EXISTS "Users can update own appointments" ON public.appointments;
CREATE POLICY "Users can update own appointments" ON public.appointments
  FOR UPDATE USING (
    receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid())
  )
  WITH CHECK (
    receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid())
  );
