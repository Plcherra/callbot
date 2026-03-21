-- Immutable usage ledger (append-only; tamper-evident hash)

CREATE TABLE IF NOT EXISTS public.usage_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  call_id UUID REFERENCES public.billing_calls(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  event_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unit_type TEXT NOT NULL DEFAULT 'minute' CHECK (unit_type = 'minute'),
  quantity NUMERIC(14, 6) NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('telnyx_webhook', 'reconciliation_job')),
  entry_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS usage_ledger_entry_hash_unique ON public.usage_ledger(entry_hash);

CREATE INDEX IF NOT EXISTS usage_ledger_user_period_idx
  ON public.usage_ledger(user_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS usage_ledger_subscription_idx ON public.usage_ledger(subscription_id);

ALTER TABLE public.usage_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own usage_ledger" ON public.usage_ledger
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role full access usage_ledger" ON public.usage_ledger
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
