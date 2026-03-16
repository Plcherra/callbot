-- Optional location and service fields for appointments (solo/personal ready).
-- Services: requires_location, default_location_type, intake_questions.
-- Appointments: extended booking record linked to calendar event.

-- 1) Services: location requirements
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS requires_location BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_location_type TEXT,
  ADD COLUMN IF NOT EXISTS intake_questions JSONB;

COMMENT ON COLUMN public.services.requires_location IS 'If true, assistant must collect location before booking this service.';
COMMENT ON COLUMN public.services.default_location_type IS 'One of: no_location, customer_address, phone_call, video_meeting, custom.';
COMMENT ON COLUMN public.services.intake_questions IS 'Reserved for future intake/custom questions.';

-- 2) Appointments: provider-ready booking record (one per calendar event created via voice/API)
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  summary TEXT NOT NULL DEFAULT 'Appointment',
  description TEXT,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  service_name TEXT,
  location_type TEXT,
  location_text TEXT,
  customer_address TEXT,
  price_cents INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS appointments_event_id_receptionist_idx
  ON public.appointments(receptionist_id, event_id);
CREATE INDEX IF NOT EXISTS appointments_receptionist_id_idx ON public.appointments(receptionist_id);
CREATE INDEX IF NOT EXISTS appointments_start_time_idx ON public.appointments(start_time DESC);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own appointments" ON public.appointments
  FOR SELECT USING (
    receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid())
  );
CREATE POLICY "Service role full access appointments" ON public.appointments
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE public.appointments IS 'Extended booking data per calendar event; provider-ready for Square etc.';
COMMENT ON COLUMN public.appointments.location_type IS 'e.g. customer_address, phone_call, video_meeting, custom.';
COMMENT ON COLUMN public.appointments.location_text IS 'Free-form location (e.g. Zoom link, custom instructions).';
COMMENT ON COLUMN public.appointments.customer_address IS 'Structured address when location_type is customer_address.';
