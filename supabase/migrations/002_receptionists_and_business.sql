-- Add business fields to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS business_name TEXT,
  ADD COLUMN IF NOT EXISTS business_address TEXT;

-- receptionists table
CREATE TABLE IF NOT EXISTS public.receptionists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  vapi_assistant_id TEXT,
  calendar_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.receptionists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own receptionists" ON public.receptionists
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own receptionists" ON public.receptionists
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own receptionists" ON public.receptionists
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own receptionists" ON public.receptionists
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS receptionists_user_id_idx ON public.receptionists(user_id);
