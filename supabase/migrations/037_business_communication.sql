-- Business + per-business communication state (voice line mirror, SMS 10DLC, WhatsApp).
-- v1 product: ONE business per owner (owner_user_id UNIQUE). Multi-business owners (e.g. agencies)
--   requires dropping this constraint in a future migration.
--
-- Backfill: only users who already have at least one ACTIVE receptionist WITH a Telnyx line
--   (avoids junk rows for stale/test accounts with no real number).

-- 1) businesses
CREATE TABLE IF NOT EXISTS public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT,
  mode TEXT NOT NULL DEFAULT 'solo' CHECK (mode IN ('solo', 'team')),
  primary_receptionist_id UUID REFERENCES public.receptionists(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT businesses_owner_user_id_unique UNIQUE (owner_user_id)
);

CREATE INDEX IF NOT EXISTS businesses_owner_user_id_idx ON public.businesses(owner_user_id);

COMMENT ON TABLE public.businesses IS 'EchoDesk customer account (v1: one per owner_user_id).';
COMMENT ON CONSTRAINT businesses_owner_user_id_unique ON public.businesses IS
  'v1 assumes one business per owner; remove for multi-business-per-user later.';

-- 2) Link receptionists to business (optional FK for joins; backfilled below)
ALTER TABLE public.receptionists
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS receptionists_business_id_idx
  ON public.receptionists(business_id) WHERE business_id IS NOT NULL;

-- 3) One primary phone record per business (canonical product line; mirrors primary receptionist Telnyx in v1)
CREATE TABLE IF NOT EXISTS public.business_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'telnyx',
  phone_number_e164 TEXT,
  telnyx_number_id TEXT,
  status TEXT NOT NULL DEFAULT 'provisioning' CHECK (status IN ('provisioning', 'active', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT business_phone_numbers_business_unique UNIQUE (business_id)
);

-- 4) SMS / 10DLC campaign tracking (one row per business in v1)
CREATE TABLE IF NOT EXISTS public.sms_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  brand_id TEXT,
  campaign_id TEXT,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'pending', 'approved', 'failed')),
  failure_reason TEXT,
  last_submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT sms_campaigns_business_unique UNIQUE (business_id)
);

-- 5) WhatsApp connection (one row per business in v1)
CREATE TABLE IF NOT EXISTS public.whatsapp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  meta_business_id TEXT,
  whatsapp_number_id TEXT,
  status TEXT NOT NULL DEFAULT 'not_connected'
    CHECK (status IN ('not_connected', 'pending', 'active', 'failed')),
  failure_reason TEXT,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT whatsapp_accounts_business_unique UNIQUE (business_id)
);

-- RLS
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own businesses" ON public.businesses;
CREATE POLICY "Users read own businesses" ON public.businesses
  FOR SELECT USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Users update own businesses" ON public.businesses;
CREATE POLICY "Users update own businesses" ON public.businesses
  FOR UPDATE USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Service role full businesses" ON public.businesses;
CREATE POLICY "Service role full businesses" ON public.businesses
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Users read own business_phone_numbers" ON public.business_phone_numbers;
CREATE POLICY "Users read own business_phone_numbers" ON public.business_phone_numbers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_phone_numbers.business_id AND b.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role full business_phone_numbers" ON public.business_phone_numbers;
CREATE POLICY "Service role full business_phone_numbers" ON public.business_phone_numbers
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Users read own sms_campaigns" ON public.sms_campaigns;
CREATE POLICY "Users read own sms_campaigns" ON public.sms_campaigns
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = sms_campaigns.business_id AND b.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role full sms_campaigns" ON public.sms_campaigns;
CREATE POLICY "Service role full sms_campaigns" ON public.sms_campaigns
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Users read own whatsapp_accounts" ON public.whatsapp_accounts;
CREATE POLICY "Users read own whatsapp_accounts" ON public.whatsapp_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = whatsapp_accounts.business_id AND b.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role full whatsapp_accounts" ON public.whatsapp_accounts;
CREATE POLICY "Service role full whatsapp_accounts" ON public.whatsapp_accounts
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Backfill: only active receptionists with a Telnyx id or stored Telnyx/E.164 number
INSERT INTO public.businesses (owner_user_id, name, mode, primary_receptionist_id, created_at, updated_at)
SELECT DISTINCT ON (r.user_id)
  r.user_id,
  u.business_name,
  CASE WHEN r.mode = 'business' THEN 'team' ELSE 'solo' END,
  r.id,
  NOW(),
  NOW()
FROM public.receptionists r
JOIN public.users u ON u.id = r.user_id
WHERE r.status = 'active'
  AND r.active IS TRUE
  AND r.deleted_at IS NULL
  AND (r.telnyx_phone_number_id IS NOT NULL OR r.telnyx_phone_number IS NOT NULL)
ORDER BY r.user_id, r.created_at ASC;

-- For each backfilled business, attach primary receptionist and child rows
UPDATE public.receptionists rec
SET business_id = b.id
FROM public.businesses b
WHERE b.primary_receptionist_id = rec.id
  AND rec.business_id IS NULL;

INSERT INTO public.business_phone_numbers (business_id, provider, phone_number_e164, telnyx_number_id, status, created_at, updated_at)
SELECT
  b.id,
  'telnyx',
  COALESCE(rec.telnyx_phone_number, rec.inbound_phone_number, rec.phone_number),
  rec.telnyx_phone_number_id,
  CASE
    WHEN rec.telnyx_phone_number_id IS NOT NULL
      AND COALESCE(rec.telnyx_phone_number, rec.inbound_phone_number) IS NOT NULL
    THEN 'active'
    ELSE 'provisioning'
  END,
  NOW(),
  NOW()
FROM public.businesses b
JOIN public.receptionists rec ON rec.id = b.primary_receptionist_id
ON CONFLICT (business_id) DO NOTHING;

INSERT INTO public.sms_campaigns (business_id, status, created_at, updated_at)
SELECT b.id, 'not_started', NOW(), NOW()
FROM public.businesses b
ON CONFLICT (business_id) DO NOTHING;

INSERT INTO public.whatsapp_accounts (business_id, status, created_at, updated_at)
SELECT b.id, 'not_connected', NOW(), NOW()
FROM public.businesses b
ON CONFLICT (business_id) DO NOTHING;

-- Any other active receptionists for those users: link business_id
UPDATE public.receptionists rec
SET business_id = b.id
FROM public.businesses b
WHERE rec.user_id = b.owner_user_id
  AND rec.status = 'active'
  AND rec.active IS TRUE
  AND rec.deleted_at IS NULL
  AND rec.business_id IS NULL;
