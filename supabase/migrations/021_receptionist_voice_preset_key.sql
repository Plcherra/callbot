-- Store which voice preset is selected for display in settings (label only).
-- voice_id remains the source of truth for TTS; voice_preset_key is for UX.
ALTER TABLE public.receptionists
  ADD COLUMN IF NOT EXISTS voice_preset_key TEXT;

COMMENT ON COLUMN public.receptionists.voice_preset_key IS 'Curated preset key (e.g. friendly_warm) for UI label; voice_id is used for TTS.';
