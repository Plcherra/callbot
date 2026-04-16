-- Multi-business per owner, richer SMS/WhatsApp onboarding states, optional active business pointer.
--
-- TODO(multi-business): Prefer users.active_business_id when set; when NULL, backend uses oldest
-- business by created_at. Replace default-oldest with explicit UX (business switcher) so this is not
-- permanent implicit behavior.

-- 1) Allow multiple businesses per owner
ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_owner_user_id_unique;

CREATE INDEX IF NOT EXISTS businesses_owner_created_idx ON public.businesses (owner_user_id, created_at);

COMMENT ON TABLE public.businesses IS 'EchoDesk business account. Multiple rows per owner_user_id allowed.';

-- 2) Optional preferred business (future switcher; nullable until mobile sets it)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS active_business_id UUID REFERENCES public.businesses (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_active_business_id_idx ON public.users (active_business_id);

COMMENT ON COLUMN public.users.active_business_id IS
  'Preferred business when owner has multiple. NULL = use default (currently oldest businesses.created_at).';

-- 3) SMS: explicit setup journey states
ALTER TABLE public.sms_campaigns DROP CONSTRAINT IF EXISTS sms_campaigns_status_check;

UPDATE public.sms_campaigns SET status = 'pending_review' WHERE status = 'pending';

ALTER TABLE public.sms_campaigns ADD CONSTRAINT sms_campaigns_status_check CHECK (
  status IN ('not_started', 'needs_submission', 'pending_review', 'approved', 'failed')
);

-- 4) WhatsApp: needs_connection step before pending
ALTER TABLE public.whatsapp_accounts DROP CONSTRAINT IF EXISTS whatsapp_accounts_status_check;

ALTER TABLE public.whatsapp_accounts ADD CONSTRAINT whatsapp_accounts_status_check CHECK (
  status IN ('not_connected', 'needs_connection', 'pending', 'active', 'failed')
);
