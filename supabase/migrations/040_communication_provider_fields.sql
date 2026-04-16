-- Provider-backed SMS (10DLC) and WhatsApp onboarding: registration blob + handoff/session fields.
-- registration_profile may contain PII (EIN, address). Treat as sensitive; access via service role / app API only.

ALTER TABLE public.sms_campaigns
  ADD COLUMN IF NOT EXISTS registration_profile JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS provider_brand_status TEXT,
  ADD COLUMN IF NOT EXISTS provider_campaign_status TEXT;

COMMENT ON COLUMN public.sms_campaigns.registration_profile IS
  '10DLC inputs EchoDesk sends to Telnyx (brand/campaign). May include EIN, street address, opt-in copy. Sensitive.';

COMMENT ON COLUMN public.sms_campaigns.provider_brand_status IS
  'Last known Telnyx/TCR brand status string (e.g. OK, REGISTRATION_PENDING).';

COMMENT ON COLUMN public.sms_campaigns.provider_campaign_status IS
  'Last known Telnyx/TCR campaign status string.';

ALTER TABLE public.whatsapp_accounts
  ADD COLUMN IF NOT EXISTS telnyx_signup_id TEXT,
  ADD COLUMN IF NOT EXISTS embedded_oauth_url TEXT,
  ADD COLUMN IF NOT EXISTS signup_state TEXT,
  ADD COLUMN IF NOT EXISTS last_provider_poll_at TIMESTAMPTZ;

COMMENT ON COLUMN public.whatsapp_accounts.telnyx_signup_id IS
  'Telnyx WhatsApp embedded signup session id when returned by provider API.';

COMMENT ON COLUMN public.whatsapp_accounts.embedded_oauth_url IS
  'Meta/Telnyx OAuth or portal handoff URL; often short-lived.';

COMMENT ON COLUMN public.whatsapp_accounts.signup_state IS
  'Last provider-reported embedded signup FSM state (e.g. initiated, facebook_auth).';
