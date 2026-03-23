-- Call recording visibility: store recording metadata for playback and download.
-- Backend populates these when Telnyx sends call.recording.saved webhook.

ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS recording_status TEXT,
  ADD COLUMN IF NOT EXISTS recording_url TEXT,
  ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recording_duration_seconds INTEGER;

COMMENT ON COLUMN public.call_logs.recording_status IS 'available | processing | not_recorded | failed';
COMMENT ON COLUMN public.call_logs.recording_url IS 'Playback/download URL (may expire; Telnyx default URLs expire in ~10 min)';
COMMENT ON COLUMN public.call_logs.recorded_at IS 'When recording was saved/ready';
COMMENT ON COLUMN public.call_logs.recording_duration_seconds IS 'Duration of the recording in seconds';
