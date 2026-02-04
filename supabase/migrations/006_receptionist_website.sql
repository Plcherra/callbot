-- Website URL and extracted content for receptionist knowledge; extra instructions (free-text)
ALTER TABLE public.receptionists
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS website_content TEXT,
  ADD COLUMN IF NOT EXISTS website_content_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extra_instructions TEXT;
