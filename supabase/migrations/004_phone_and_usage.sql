-- Per-number provisioning, usage tracking, billing plan, onboarding

-- Receptionists: Vapi phone number id and display number
ALTER TABLE public.receptionists
  ADD COLUMN IF NOT EXISTS vapi_phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS inbound_phone_number TEXT;

-- Call usage: raw call events from Vapi webhook
CREATE TABLE IF NOT EXISTS public.call_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  vapi_call_id TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS call_usage_vapi_call_id_idx ON public.call_usage(vapi_call_id) WHERE vapi_call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS call_usage_receptionist_started_idx ON public.call_usage(receptionist_id, started_at);

ALTER TABLE public.call_usage ENABLE ROW LEVEL SECURITY;

-- Service role can do anything (webhook inserts)
CREATE POLICY "Service role full access call_usage" ON public.call_usage
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Users can read call_usage for their receptionists
CREATE POLICY "Users can read own call_usage" ON public.call_usage
  FOR SELECT USING (receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid()));

-- Usage snapshots: per-receptionist per billing period (for display and billing)
CREATE TABLE IF NOT EXISTS public.usage_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_seconds INTEGER NOT NULL DEFAULT 0,
  billing_plan TEXT,
  included_minutes INTEGER,
  overage_minutes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(receptionist_id, period_start)
);

CREATE INDEX IF NOT EXISTS usage_snapshots_user_period_idx ON public.usage_snapshots(user_id, period_start);
CREATE INDEX IF NOT EXISTS usage_snapshots_receptionist_period_idx ON public.usage_snapshots(receptionist_id, period_start);

ALTER TABLE public.usage_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage_snapshots" ON public.usage_snapshots
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role full access usage_snapshots" ON public.usage_snapshots
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Users: billing plan and onboarding
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS billing_plan TEXT,
  ADD COLUMN IF NOT EXISTS billing_plan_metadata JSONB,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_stripe_subscription_id_idx ON public.users(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
