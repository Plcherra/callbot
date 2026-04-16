-- Demote WhatsApp rows left in pending without any provider/Meta progression recorded.
-- Pending should only reflect real in-flight external onboarding (see whatsapp_onboarding + webhooks).

UPDATE public.whatsapp_accounts
SET status = 'needs_connection', updated_at = NOW()
WHERE status = 'pending'
  AND (meta_business_id IS NULL OR btrim(meta_business_id) = '')
  AND (whatsapp_number_id IS NULL OR btrim(whatsapp_number_id) = '');
