-- Receptionist config: system_prompt, greeting, voice_id, assistant_identity
-- Call logs: event-driven call history (every call counts, even 0 billable minutes)

-- Receptionists: new config fields
ALTER TABLE public.receptionists
  ADD COLUMN IF NOT EXISTS system_prompt TEXT,
  ADD COLUMN IF NOT EXISTS greeting TEXT,
  ADD COLUMN IF NOT EXISTS voice_id TEXT,
  ADD COLUMN IF NOT EXISTS assistant_identity TEXT;

-- call_logs: event-driven call history
CREATE TABLE IF NOT EXISTS public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_control_id TEXT NOT NULL,
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  from_number TEXT,
  to_number TEXT,
  direction TEXT CHECK (direction IS NULL OR direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'answered', 'streaming', 'completed', 'failed', 'rejected')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ,
  streaming_started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  cost_cents INTEGER,
  transcript TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS call_logs_call_control_id_idx
  ON public.call_logs(call_control_id);

CREATE INDEX IF NOT EXISTS call_logs_receptionist_id_idx
  ON public.call_logs(receptionist_id);

CREATE INDEX IF NOT EXISTS call_logs_user_id_idx
  ON public.call_logs(user_id);

CREATE INDEX IF NOT EXISTS call_logs_started_at_idx
  ON public.call_logs(started_at DESC);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

-- Service role can insert/update (webhook writes)
CREATE POLICY "Service role full access call_logs" ON public.call_logs
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Users can read call_logs for their receptionists
CREATE POLICY "Users can read own call_logs" ON public.call_logs
  FOR SELECT USING (
    receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = auth.uid())
  );

-- RPC for dashboard summary: total_calls, total_seconds for user's receptionists
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(p_user_id UUID)
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'total_calls', COUNT(*)::int,
    'total_seconds', COALESCE(SUM(duration_seconds), 0)::int
  )
  FROM public.call_logs cl
  WHERE cl.receptionist_id IN (SELECT id FROM public.receptionists WHERE user_id = p_user_id)
    AND cl.status = 'completed';
$$;
