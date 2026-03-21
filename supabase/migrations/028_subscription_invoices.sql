-- Invoices and line items (Option A period close; Stripe provider_invoice_id optional)

CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  provider_invoice_id TEXT,
  metadata_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_invoices_user_period_unique
  ON public.subscription_invoices(user_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS subscription_invoices_user_idx ON public.subscription_invoices(user_id);

CREATE TABLE IF NOT EXISTS public.subscription_invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.subscription_invoices(id) ON DELETE CASCADE,
  line_type TEXT NOT NULL CHECK (line_type IN ('base_fee', 'overage')),
  quantity NUMERIC(14, 6),
  unit_price_cents INTEGER,
  amount_cents INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscription_invoice_line_items_invoice_idx
  ON public.subscription_invoice_line_items(invoice_id);

ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own subscription_invoices" ON public.subscription_invoices
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role full access subscription_invoices" ON public.subscription_invoices
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Users read own line items via invoice" ON public.subscription_invoice_line_items
  FOR SELECT USING (
    invoice_id IN (SELECT id FROM public.subscription_invoices WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role full access subscription_invoice_line_items" ON public.subscription_invoice_line_items
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
