-- Telnyx migration: extend call_usage, add user_plans, Telnyx phone fields

-- Add to call_usage
ALTER TABLE public.call_usage
  ADD COLUMN IF NOT EXISTS overage_flag BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS billed_minutes NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS payg_minutes NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS telnyx_call_control_id TEXT;

-- direction column may already exist from 009; ensure check constraint if needed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'call_usage' AND column_name = 'direction'
  ) THEN
    ALTER TABLE public.call_usage ADD COLUMN direction TEXT;
  END IF;
END $$;

-- Drop existing direction check if present, add our constraint
ALTER TABLE public.call_usage DROP CONSTRAINT IF EXISTS call_usage_direction_check;
ALTER TABLE public.call_usage ADD CONSTRAINT call_usage_direction_check
  CHECK (direction IS NULL OR direction IN ('inbound', 'outbound'));

CREATE UNIQUE INDEX IF NOT EXISTS call_usage_telnyx_call_control_id_idx
  ON public.call_usage(telnyx_call_control_id) WHERE telnyx_call_control_id IS NOT NULL;

-- user_plans: per-user plan config (inbound/outbound split, overage rate)
CREATE TABLE IF NOT EXISTS public.user_plans (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  billing_plan TEXT NOT NULL,
  allocated_inbound_minutes INTEGER,
  allocated_outbound_minutes INTEGER,
  inbound_percent INTEGER DEFAULT 80 CHECK (inbound_percent >= 0 AND inbound_percent <= 100),
  outbound_percent INTEGER DEFAULT 20 CHECK (outbound_percent >= 0 AND outbound_percent <= 100),
  overage_rate_cents INTEGER DEFAULT 25,
  payg_rate_cents INTEGER DEFAULT 20,
  used_inbound_minutes NUMERIC(10,4) DEFAULT 0,
  used_outbound_minutes NUMERIC(10,4) DEFAULT 0,
  period_reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own user_plans" ON public.user_plans;
CREATE POLICY "Users can read own user_plans" ON public.user_plans FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access user_plans" ON public.user_plans;
CREATE POLICY "Service role full access user_plans" ON public.user_plans FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Extend usage_snapshots for direction-aware aggregation
ALTER TABLE public.usage_snapshots
  ADD COLUMN IF NOT EXISTS inbound_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outbound_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payg_minutes NUMERIC(10,4) DEFAULT 0;

-- Receptionists: Telnyx phone number fields
ALTER TABLE public.receptionists
  ADD COLUMN IF NOT EXISTS telnyx_phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS telnyx_phone_number TEXT;

CREATE INDEX IF NOT EXISTS receptionists_telnyx_phone_number_idx
  ON public.receptionists(telnyx_phone_number) WHERE telnyx_phone_number IS NOT NULL;
