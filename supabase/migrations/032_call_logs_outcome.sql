-- call_logs.outcome: explicit call outcome for mobile UI (booked, missed, completed, etc.).
-- Mobile app infers outcome from duration/answered_at when absent; this column enables server-side values.

ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS outcome TEXT;

COMMENT ON COLUMN public.call_logs.outcome IS 'Explicit call outcome: booked | missed | short_call | completed | unknown';
