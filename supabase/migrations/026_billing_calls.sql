-- Per-call billing facts (per-second billable time; Telnyx CDR)

CREATE TABLE IF NOT EXISTS public.billing_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  telnyx_call_control_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  connected_seconds INTEGER NOT NULL DEFAULT 0 CHECK (connected_seconds >= 0),
  billable_seconds INTEGER NOT NULL DEFAULT 0 CHECK (billable_seconds >= 0),
  billable_minutes NUMERIC(14, 6) NOT NULL DEFAULT 0,
  direction TEXT CHECK (direction IS NULL OR direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'completed',
  metadata_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_calls_telnyx_id_unique
  ON public.billing_calls(telnyx_call_control_id);

CREATE INDEX IF NOT EXISTS billing_calls_user_started_idx
  ON public.billing_calls(user_id, started_at DESC);

ALTER TABLE public.billing_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own billing_calls" ON public.billing_calls
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role full access billing_calls" ON public.billing_calls
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
