-- Stable Telnyx recording id for refreshing short-lived download URLs (presigned S3).
-- Populated from call.recording.saved webhook payload.recording_id.

ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS telnyx_recording_id TEXT;

COMMENT ON COLUMN public.call_logs.telnyx_recording_id IS
  'Telnyx GET /v2/recordings/{id}; used to mint fresh download_urls (stored recording_url expires ~10m)';
