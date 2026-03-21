-- Option A tiered plans: Starter, Growth, Pro with flat overage rate (8 cents/min)

CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code IN ('starter', 'growth', 'pro')),
  name TEXT NOT NULL,
  monthly_fee_cents INTEGER NOT NULL,
  included_minutes INTEGER NOT NULL,
  overage_rate_cents_per_minute INTEGER NOT NULL DEFAULT 8,
  is_active BOOLEAN DEFAULT true,
  metadata_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.plans (code, name, monthly_fee_cents, included_minutes, overage_rate_cents_per_minute)
VALUES
  ('starter', 'Starter', 2900, 300, 8),
  ('growth', 'Growth', 5900, 800, 8),
  ('pro', 'Pro', 9900, 1800, 8)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read active plans" ON public.plans
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "Service role full access plans" ON public.plans
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
