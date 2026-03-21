-- Analytics default plan mix + usage threshold alert deduplication

CREATE TABLE IF NOT EXISTS public.billing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.billing_config (key, value_json)
VALUES (
  'analytics_default_plan_mix',
  '{"starter": 0.6, "growth": 0.3, "pro": 0.1}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json;

ALTER TABLE public.billing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role billing_config" ON public.billing_config
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE TABLE IF NOT EXISTS public.usage_alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  threshold_pct INTEGER NOT NULL CHECK (threshold_pct IN (50, 80, 100, 130)),
  alerted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, period_start, period_end, threshold_pct)
);

CREATE INDEX IF NOT EXISTS usage_alert_events_user_idx ON public.usage_alert_events(user_id);

ALTER TABLE public.usage_alert_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own usage_alert_events" ON public.usage_alert_events
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role usage_alert_events" ON public.usage_alert_events
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
