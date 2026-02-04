-- Idempotency for per-minute billing: one invoice per user per period
CREATE TABLE IF NOT EXISTS public.billing_invoices (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  stripe_invoice_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, period_start)
);

ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access billing_invoices" ON public.billing_invoices
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users can read own billing_invoices" ON public.billing_invoices
  FOR SELECT USING (user_id = auth.uid());
