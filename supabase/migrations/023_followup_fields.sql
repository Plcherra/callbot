-- Owner-controlled follow-up fields (MVP)
-- Services: followup metadata
-- Receptionists: generic follow-up message template for no-service bookings
-- Appointments: persist resolved follow-up outcome per booking

-- 1) Services: follow-up configuration (nullable, owner-controlled)
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS followup_mode TEXT,
  ADD COLUMN IF NOT EXISTS followup_message_template TEXT,
  ADD COLUMN IF NOT EXISTS payment_link TEXT,
  ADD COLUMN IF NOT EXISTS meeting_instructions TEXT,
  ADD COLUMN IF NOT EXISTS owner_selected_platform TEXT,
  ADD COLUMN IF NOT EXISTS internal_followup_notes TEXT;

COMMENT ON COLUMN public.services.followup_mode IS 'One of: none, under_review, send_payment_link, send_custom_message.';
COMMENT ON COLUMN public.services.followup_message_template IS 'Optional template to speak/send after booking.';
COMMENT ON COLUMN public.services.payment_link IS 'Optional payment link for send_payment_link mode.';
COMMENT ON COLUMN public.services.meeting_instructions IS 'Optional owner-defined meeting instructions.';
COMMENT ON COLUMN public.services.owner_selected_platform IS 'Optional owner-selected platform label for video meetings.';
COMMENT ON COLUMN public.services.internal_followup_notes IS 'Optional internal notes for owner/staff.';

-- Best-effort constraint (safe even if existing rows have NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'services_followup_mode_check'
  ) THEN
    ALTER TABLE public.services
      ADD CONSTRAINT services_followup_mode_check
      CHECK (followup_mode IS NULL OR followup_mode IN ('none', 'under_review', 'send_payment_link', 'send_custom_message'));
  END IF;
END $$;

-- 2) Receptionists: generic follow-up template for no-service bookings
ALTER TABLE public.receptionists
  ADD COLUMN IF NOT EXISTS generic_followup_message_template TEXT;

COMMENT ON COLUMN public.receptionists.generic_followup_message_template IS 'Fallback message template for generic/no-service bookings.';

-- 3) Appointments: persist resolved follow-up data
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS booking_mode TEXT,
  ADD COLUMN IF NOT EXISTS followup_mode TEXT,
  ADD COLUMN IF NOT EXISTS followup_message_resolved TEXT,
  ADD COLUMN IF NOT EXISTS payment_link TEXT,
  ADD COLUMN IF NOT EXISTS meeting_instructions TEXT,
  ADD COLUMN IF NOT EXISTS owner_selected_platform TEXT,
  ADD COLUMN IF NOT EXISTS internal_followup_notes TEXT;

COMMENT ON COLUMN public.appointments.booking_mode IS 'service_based or generic.';
COMMENT ON COLUMN public.appointments.followup_mode IS 'Resolved follow-up mode at time of booking.';
COMMENT ON COLUMN public.appointments.followup_message_resolved IS 'Resolved follow-up message text for this appointment.';
