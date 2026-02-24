-- Extend call_usage for Twilio billing: cost tracking, direction, per-account queries
-- Extend billing_invoices for subscription overage idempotency

ALTER TABLE public.billing_invoices
  ADD COLUMN IF NOT EXISTS invoice_type TEXT NOT NULL DEFAULT 'per_minute';

-- Allow multiple invoice types per user per period (per_minute vs overage)
ALTER TABLE public.billing_invoices DROP CONSTRAINT IF EXISTS billing_invoices_pkey;
ALTER TABLE public.billing_invoices
  ADD PRIMARY KEY (user_id, period_start, invoice_type);

ALTER TABLE public.call_usage
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS call_sid TEXT,
  ADD COLUMN IF NOT EXISTS direction TEXT,
  ADD COLUMN IF NOT EXISTS cost_cents INTEGER,
  ADD COLUMN IF NOT EXISTS billed_cents INTEGER,
  ADD COLUMN IF NOT EXISTS status TEXT;

-- Index for per-account queries
CREATE INDEX IF NOT EXISTS call_usage_user_id_idx ON public.call_usage(user_id) WHERE user_id IS NOT NULL;

-- Unique constraint for Twilio CallSid (prevent duplicate inserts)
CREATE UNIQUE INDEX IF NOT EXISTS call_usage_call_sid_idx ON public.call_usage(call_sid) WHERE call_sid IS NOT NULL;

-- Backfill user_id from receptionists for existing rows
UPDATE public.call_usage cu
SET user_id = r.user_id
FROM public.receptionists r
WHERE cu.receptionist_id = r.id
  AND cu.user_id IS NULL;
