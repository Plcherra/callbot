-- Receptionist settings: staff, services, locations, promos, reminder_rules (per-receptionist)
-- Payment settings: jsonb column on receptionists

-- Add payment_settings to receptionists
ALTER TABLE public.receptionists
  ADD COLUMN IF NOT EXISTS payment_settings JSONB;

-- staff: employees and availability
CREATE TABLE IF NOT EXISTS public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  specialties JSONB,
  photo_url TEXT,
  calendar_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own staff" ON public.staff
  FOR SELECT USING (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own staff" ON public.staff
  FOR INSERT WITH CHECK (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own staff" ON public.staff
  FOR UPDATE USING (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own staff" ON public.staff
  FOR DELETE USING (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS staff_receptionist_id_idx ON public.staff(receptionist_id);

-- services: catalog and pricing
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  add_ons JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own services" ON public.services
  FOR SELECT USING (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own services" ON public.services
  FOR INSERT WITH CHECK (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own services" ON public.services
  FOR UPDATE USING (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own services" ON public.services
  FOR DELETE USING (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS services_receptionist_id_idx ON public.services(receptionist_id);

-- locations: multi-store / branch support
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  hours JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own locations" ON public.locations
  FOR SELECT USING (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own locations" ON public.locations
  FOR INSERT WITH CHECK (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own locations" ON public.locations
  FOR UPDATE USING (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own locations" ON public.locations
  FOR DELETE USING (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS locations_receptionist_id_idx ON public.locations(receptionist_id);

-- promos: promotions and discount codes
CREATE TABLE IF NOT EXISTS public.promos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  code TEXT NOT NULL,
  eligibility JSONB,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  discount_type TEXT,
  discount_value NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.promos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own promos" ON public.promos
  FOR SELECT USING (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own promos" ON public.promos
  FOR INSERT WITH CHECK (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own promos" ON public.promos
  FOR UPDATE USING (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own promos" ON public.promos
  FOR DELETE USING (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS promos_receptionist_id_idx ON public.promos(receptionist_id);

-- reminder_rules: reminders and business rules/policies
CREATE TABLE IF NOT EXISTS public.reminder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('reminder', 'rule')),
  content TEXT NOT NULL,
  trigger TEXT,
  channel TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reminder_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own reminder_rules" ON public.reminder_rules
  FOR SELECT USING (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own reminder_rules" ON public.reminder_rules
  FOR INSERT WITH CHECK (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own reminder_rules" ON public.reminder_rules
  FOR UPDATE USING (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own reminder_rules" ON public.reminder_rules
  FOR DELETE USING (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS reminder_rules_receptionist_id_idx ON public.reminder_rules(receptionist_id);
